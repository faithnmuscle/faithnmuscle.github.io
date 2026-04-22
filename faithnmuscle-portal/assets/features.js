/**
 * Static feature flags - used as a fallback by pages that haven't
 * migrated to the DB-backed getFeatures() in portal.js yet.
 * All features are ON by default (except progressPhotos).
 * Client UI should use getFeatures() from portal.js (portal_settings); this
 * object is only a fallback when a page has not been wired to the DB yet.
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
