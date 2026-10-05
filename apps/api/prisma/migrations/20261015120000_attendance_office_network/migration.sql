-- A press from the office internet on a computer without a location has no lat/lng.
ALTER TABLE "AttendanceRecord" ALTER COLUMN "lat" DROP NOT NULL;
ALTER TABLE "AttendanceRecord" ALTER COLUMN "lng" DROP NOT NULL;
