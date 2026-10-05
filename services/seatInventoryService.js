const { Seat } = require('../models');

/**
 * Physical seat inventory belongs to a bus, not to a schedule.
 *
 * Seat 1 is the driver's physical position, matching the existing
 * 20260213_is_driver migration. Passenger seats are the remaining positions.
 * This function only adds missing positions; it never deletes or rewrites
 * existing inventory.
 */
async function ensureBusSeatInventory(bus, transaction) {
  const capacity = Number(bus.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error('Bus capacity must be a positive integer');
  }

  const existingSeats = await Seat.findAll({
    where: { bus_id: bus.id },
    attributes: ['seat_number'],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const existingNumbers = new Set(existingSeats.map((seat) => String(seat.seat_number)));
  const missingSeats = [];

  for (let number = 1; number <= capacity; number += 1) {
    const seatNumber = String(number);
    if (existingNumbers.has(seatNumber)) continue;

    const isDriver = number === 1;
    missingSeats.push({
      bus_id: bus.id,
      company_id: bus.company_id,
      seat_number: seatNumber,
      row: isDriver ? 1 : Math.floor((number - 2) / 4) + 1,
      col: isDriver ? 1 : ((number - 2) % 4) + 1,
      side: isDriver || ((number - 2) % 4) < 2 ? 'L' : 'R',
      is_driver: isDriver,
    });
  }

  if (missingSeats.length > 0) {
    await Seat.bulkCreate(missingSeats, {
      transaction,
      ignoreDuplicates: true,
    });
  }

  return {
    created: missingSeats.length,
    total: existingSeats.length + missingSeats.length,
  };
}

module.exports = { ensureBusSeatInventory };
