-- Business rule: every garage service must take under 55 minutes.
ALTER TABLE "GarageService" ADD CONSTRAINT "GarageService_duration_under_55" CHECK ("durationMinutes" < 55);
