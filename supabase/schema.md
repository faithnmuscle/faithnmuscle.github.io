# Supabase Schema — Faith n Muscle Portal

Project ref: `omvsxvkwbufskkowqhlr` (ap-southeast-1)

Last verified: 2026-04-25 via column probing (REST API).
Update this file whenever a migration is run.

---

## profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auth.users FK |
| email | text | |
| full_name | text | |
| role | text | `'admin'` or `'client'` |
| created_at | timestamptz | |

---

## plans
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_type | text | `'coaching'`, `'workout'`, `'meal'`, `'athletes'`, `'rehab'` |
| status | text | e.g. `'active'`, `'inactive'` |
| start_date | date | |
| end_date | date | |
| notes | text | |
| created_at | timestamptz | |

---

## plan_documents
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| plan_id | uuid | FK plans |
| uploaded_by | uuid | FK profiles |
| file_name | text | |
| storage_path | text | R2 object key |
| description | text | |
| created_at | timestamptz | |

---

## workout_logs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_id | uuid | FK plans |
| log_date | date | |
| is_rest_day | boolean | |
| session_name | text | |
| duration_min | integer | |
| perceived_effort | integer | RPE 1–10 |
| body_weight_kg | numeric | |
| avg_heart_rate_bpm | integer | |
| overall_notes | text | |
| created_at | timestamptz | |

---

## workout_exercises
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| log_id | uuid | FK workout_logs |
| exercise_name | text | |
| sets_completed | integer | legacy - old manual log schema, unused by new code |
| reps_per_set | text | legacy - old manual log schema, unused by new code |
| weight_kg | numeric | |
| notes | text | exercise-level notes (same for all sets of an exercise) |
| sort_order | integer | exercise order within session |
| set_index | integer | 0-based set index within the exercise |
| set_type | text | `'normal'`, `'warmup'`, `'failure'`, `'dropset'` |
| reps | integer | |
| distance_km | numeric | for cardio sets |
| duration_seconds | integer | for timed sets |
| rpe | numeric | per-set RPE |

One row per set (matches Hevy CSV structure). Migration run 2026-04-26 (columns set_index, set_type, reps, distance_km, duration_seconds, rpe added via ALTER TABLE). Legacy columns sets_completed and reps_per_set remain from original schema.

---

## meal_logs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_id | uuid | FK plans |
| log_date | date | |
| water_ml | integer | |
| overall_notes | text | |
| created_at | timestamptz | |

---

## meal_log_entries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| meal_log_id | uuid | FK meal_logs |
| meal_slot | text | e.g. `'Breakfast'`, `'Lunch'` |
| food_items | text | |
| portion_notes | text | |
| calories_kcal | numeric | |
| protein_g | numeric | |
| carbs_g | numeric | |
| fat_g | numeric | |

---

## progress_checkins
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_id | uuid | FK plans |
| checkin_date | date | |
| energy_level | integer | 1–10 |
| mood_level | integer | 1–10 |
| sleep_quality | integer | 1–10 |
| body_weight_kg | numeric | |
| neck_cm | numeric | |
| shoulder_cm | numeric | |
| chest_cm | numeric | |
| waist_cm | numeric | |
| abdomen_cm | numeric | |
| hip_cm | numeric | |
| bicep_left_cm | numeric | |
| bicep_right_cm | numeric | |
| thigh_left_cm | numeric | |
| thigh_right_cm | numeric | |
| calf_left_cm | numeric | |
| calf_right_cm | numeric | |
| notes | text | |
| created_at | timestamptz | |

---

## weekly_checkins
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_id | uuid | FK plans |
| week_start_date | date | Monday |
| energy_level | integer | |
| sleep_quality | integer | |
| stress_level | integer | |
| adherence_pct | integer | |
| client_note | text | |
| created_at | timestamptz | |

---

## bookings
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_id | uuid | FK plans |
| booking_date | date | |
| start_time | time | |
| end_time | time | |
| status | text | e.g. `'pending'`, `'confirmed'`, `'cancelled'` |
| client_notes | text | |
| created_at | timestamptz | |

---

## availability_templates
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| day_of_week | integer | 0=Sunday … 6=Saturday |
| start_time | time | |
| end_time | time | |
| is_active | boolean | |
| created_at | timestamptz | |

---

## availability_blocks
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| block_date | date | |
| start_time | time | |
| end_time | time | |
| reason | text | |
| created_at | timestamptz | |

---

## portal_settings
| Column | Type | Notes |
|--------|------|-------|
| key | text | PK |
| value | text | |
| updated_at | timestamptz | |

Feature flag keys: `bookings`, `workoutLogging`, `mealLogging`, `progressCheckin`, `messages`, `weeklyCheckin`, `progressPhotos`, `adminBookings`, `adminCheckins`, `adminPayments`, `adminRenewals`

---

## messages
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| plan_id | uuid | FK plans |
| sender_id | uuid | FK profiles |
| body | text | |
| is_read | boolean | |
| created_at | timestamptz | |

---

## notifications
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK profiles |
| type | text | |
| title | text | |
| body | text | |
| created_at | timestamptz | |

---

## payments
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_id | uuid | FK plans |
| amount_lkr | numeric | |
| paid_date | date | |
| notes | text | |
| created_at | timestamptz | |

---

## progress_photos
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK profiles |
| plan_id | uuid | FK plans |
| storage_path | text | R2 object key |
| photo_date | date | |
| notes | text | |
| created_at | timestamptz | |

---

## applications
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| email | text | |
| full_name | text | |
| status | text | e.g. `'pending'`, `'reviewed'` |
| form_data | jsonb | all submitted form fields |
| created_at | timestamptz | |
