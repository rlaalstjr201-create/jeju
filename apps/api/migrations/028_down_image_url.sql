-- Migration 028 DOWN
ALTER TABLE spots DROP COLUMN IF EXISTS image_url;
