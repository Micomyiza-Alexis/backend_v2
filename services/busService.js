const { Bus, Driver, User, sequelize, DriverAssignment, Schedule } = require('../models');
const { Op } = require('sequelize');
const { ensureBusSeatInventory } = require('./seatInventoryService');

const VALID_LAYOUTS = ['25','30','50'];

const listBuses = async (companyId) => {
  return await Bus.findAll({ where: { company_id: companyId }, include: [{ model: User, as: 'driver', attributes: ['id','full_name'] }] });
};

const getBus = async (companyId, id) => {
  const bus = await Bus.findByPk(id);
  if (!bus || bus.company_id !== companyId) return null;
  return bus;
};

const createBus = async (companyId, payload, options = {}) => {
  console.log('busService.createBus called', { companyId, payload });
  const { plate_number, capacity, model, seat_layout, driver_id } = payload;

  // Basic UUID validation for driver_id to avoid passing invalid legacy ids/indexes to DB
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (driver_id && !uuidRegex.test(String(driver_id))) {
    throw new Error('Invalid driver selected');
  }

  if (!plate_number) throw new Error('Plate number is required');
  if (!capacity || !Number.isInteger(Number(capacity)) || Number(capacity) <= 0) throw new Error('Invalid capacity');

  const layout = String(seat_layout || payload.seatLayout || payload.seat_layout || '30');
  if (!VALID_LAYOUTS.includes(layout)) throw new Error('Invalid seat layout');

  const cap = Number(capacity);
  if (cap > Number(layout)) throw new Error('Capacity cannot exceed seat layout count');

  return await sequelize.transaction(async (t) => {
    // Plate uniqueness per company
    const existing = await Bus.findOne({ where: { company_id: companyId, plate_number }, transaction: t });
    if (existing) throw new Error('Plate number already exists for this company');

    // If driver provided, validate and auto-unassign any other active bus
    if (driver_id) {
      console.log('Validating driver assignment for driver_id:', driver_id);
      // Prefer the canonical User.driver model (users table). Fall back to legacy Driver table.
      let driver = await User.findByPk(driver_id, { transaction: t });
      if (driver) {
        if (driver.role !== 'driver' || driver.company_id !== companyId) throw new Error('Driver not found for this company');
      } else {
        // Legacy Driver table (kept for backwards compatibility)
        driver = await Driver.findByPk(driver_id, { transaction: t });
        if (!driver || driver.company_id !== companyId) throw new Error('Driver not found for this company');
      }

      // Find any other active bus assigned to this driver
      const other = await Bus.findOne({ where: { driver_id, status: 'ACTIVE' }, transaction: t });
      if (other) {
        // unassign previous bus and mark its DriverAssignment as unassigned
        other.driver_id = null;
        await other.save({ transaction: t });
        await DriverAssignment.update({ unassigned_at: new Date() }, { where: { bus_id: other.id, unassigned_at: null }, transaction: t });
      }
    }

    const bus = await Bus.create({
      company_id: companyId,
      plate_number,
      capacity: cap,
      model: model || null,
      seat_layout: layout,
      driver_id: driver_id || null,
      status: 'ACTIVE'
    }, { transaction: t });

    await ensureBusSeatInventory(bus, t);

    if (driver_id) {
      await DriverAssignment.create({ bus_id: bus.id, driver_id, company_id: companyId, assigned_by: options.assignedBy || null, assigned_at: new Date() }, { transaction: t });
    }

    console.log('busService.createBus committed', { busId: bus.id, companyId });
    return bus;
  });
};

const updateBus = async (companyId, id, payload, options = {}) => {
  console.log('busService.updateBus called', { companyId, id, payload });

  return await sequelize.transaction(async (t) => {
    const bus = await Bus.findByPk(id, { transaction: t, lock: true });
    if (!bus || bus.company_id !== companyId) throw new Error('Bus not found');

    const updates = {};
    if (payload.plate_number) {
      // unique per company
      const existing = await Bus.findOne({ where: { company_id: companyId, plate_number: payload.plate_number, id: { [Op.ne]: id } }, transaction: t });
      if (existing) throw new Error('Plate number already exists for this company');
      updates.plate_number = payload.plate_number;
    }

    if (payload.seat_layout) {
      const layout = String(payload.seat_layout);
      if (!VALID_LAYOUTS.includes(layout)) throw new Error('Invalid seat layout');
      updates.seat_layout = layout;
      // adjust capacity if provided or ensure consistency
      if (payload.capacity) {
        const cap = Number(payload.capacity);
        if (cap > Number(layout)) throw new Error('Capacity cannot exceed seat layout count');
        updates.capacity = cap;
      } else if (bus.capacity > Number(layout)) {
        // reduce capacity to layout if existing capacity larger
        updates.capacity = Number(layout);
      }
    } else if (payload.capacity) {
      const cap = Number(payload.capacity);
      if (cap <= 0) throw new Error('Invalid capacity');
      if (bus.seat_layout && cap > Number(bus.seat_layout)) throw new Error('Capacity cannot exceed seat layout count');
      updates.capacity = cap;
    }

    if (payload.model !== undefined) updates.model = payload.model;
    if (payload.status) {
      if (!['ACTIVE','INACTIVE'].includes(payload.status)) throw new Error('Invalid status');
      updates.status = payload.status;
    }

    // driver assignment handled carefully
    if (payload.driver_id !== undefined) {
      // Validate driver_id format
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (payload.driver_id !== null && !uuidRegex.test(String(payload.driver_id))) {
        throw new Error('Invalid driver selected');
      }
      // handle assignment/unassignment in a transaction to ensure consistency
      if (payload.driver_id === null) {
        updates.driver_id = null;
        // mark any active driver assignment as unassigned
        await DriverAssignment.update({ unassigned_at: new Date() }, { where: { bus_id: id, unassigned_at: null }, transaction: t });
      } else {
        // Prefer canonical User record for driver validation
        let driver = await User.findByPk(payload.driver_id, { transaction: t });
        if (driver) {
          if (driver.role !== 'driver' || driver.company_id !== companyId) throw new Error('Driver not found for this company');
        } else {
          driver = await Driver.findByPk(payload.driver_id, { transaction: t });
          if (!driver || driver.company_id !== companyId) throw new Error('Driver not found for this company');
        }

        // Prevent assigning driver to multiple active buses; if found, auto-unassign it
        const other = await Bus.findOne({ where: { driver_id: payload.driver_id, status: 'ACTIVE', id: { [Op.ne]: id } }, transaction: t });
        if (other) {
          other.driver_id = null;
          await other.save({ transaction: t });
          await DriverAssignment.update({ unassigned_at: new Date() }, { where: { bus_id: other.id, unassigned_at: null }, transaction: t });
        }
        updates.driver_id = payload.driver_id;
        // create a DriverAssignment record
        await DriverAssignment.create({
          bus_id: id,
          driver_id: payload.driver_id,
          company_id: companyId,
          assigned_by: options.assignedBy || null,
          assigned_at: new Date()
        }, { transaction: t });
      }
    }

    Object.assign(bus, updates);
    await bus.save({ transaction: t });
    await ensureBusSeatInventory(bus, t);
    console.log('busService.updateBus committed', { busId: bus.id, updates });
    return bus;
  });
};

const setStatus = async (companyId, id, status, options = {}) => {
  if (!['ACTIVE','INACTIVE'].includes(status)) throw new Error('Invalid status');

  return await sequelize.transaction(async (t) => {
    const bus = await Bus.findByPk(id, { transaction: t, lock: true });
    if (!bus || bus.company_id !== companyId) throw new Error('Bus not found');

    // If deactivating, unassign driver and mark assignment record
    if (status === 'INACTIVE' && bus.driver_id) {
      const oldDriverId = bus.driver_id;
      bus.driver_id = null;
      await DriverAssignment.update({ unassigned_at: new Date() }, { where: { bus_id: id, unassigned_at: null }, transaction: t });
      await bus.save({ transaction: t });
      // return updated bus (status set below)
    }

    bus.status = status;
    await bus.save({ transaction: t });
    console.log('busService.setStatus committed', { busId: bus.id, status });
    return bus;
  });
};

const softDelete = async (companyId, id) => {
  console.log('busService.softDelete called', { companyId, id });

  // Prevent soft-deleting a bus with active schedules
  const activeSchedules = await Schedule.findAll({
    where: {
      bus_id: id,
      status: { [Op.in]: ['scheduled', 'in_progress'] }
    }
  });

  if (activeSchedules && activeSchedules.length > 0) {
    throw new Error('Cannot delete bus with active schedules');
  }

  // Soft delete: mark inactive
  const bus = await setStatus(companyId, id, 'INACTIVE');
  console.log('busService.softDelete completed', { busId: bus.id });
  return bus;
};

const deleteBus = async (companyId, id) => {
  console.log('busService.deleteBus called', { companyId, id });

  return await sequelize.transaction(async (t) => {
    const bus = await Bus.findByPk(id, { transaction: t, lock: true });
    if (!bus || bus.company_id !== companyId) throw new Error('Bus not found');

    // Prevent deleting a bus with active schedules
    const activeSchedule = await Schedule.findOne({
      where: { bus_id: id, status: { [Op.in]: ['scheduled', 'in_progress'] } },
      transaction: t
    });

    if (activeSchedule) throw new Error('Cannot delete bus with active schedules');

    const deletedCount = await Bus.destroy({ where: { id: id, company_id: companyId }, transaction: t });
    if (!deletedCount) throw new Error('Failed to delete bus');

    console.log('busService.deleteBus committed', { busId: id });
    return { deleted: true, busId: id };
  });
};

module.exports = {
  listBuses,
  getBus,
  createBus,
  updateBus,
  setStatus,
  softDelete,
  deleteBus
};
