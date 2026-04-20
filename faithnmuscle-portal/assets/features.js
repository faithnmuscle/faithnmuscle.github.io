/**
 * Static feature flags - used as a fallback by pages that haven't
 * migrated to the DB-backed getFeatures() in portal.js yet.
 * All features are ON by default (except progressPhotos).
 */
export const FEATURES = {
  bookings:        true,
  workoutLogging:  true,
  mealLogging:     true,
  progressCheckin: true,
  messages:        true,
  weeklyCheckin:   true,
  progressPhotos:  false,
  adminBookings:   true,
  adminCheckins:   true,
  adminPayments:   true,
  adminRenewals:   true,
};
