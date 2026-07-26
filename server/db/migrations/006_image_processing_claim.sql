ALTER TABLE images
  ADD COLUMN processing_token TEXT;

CREATE INDEX images_processing_lease_idx
  ON images (updated_at)
  WHERE status = 'processing';
