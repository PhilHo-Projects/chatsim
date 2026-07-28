ALTER TABLE users
  ADD COLUMN bio TEXT;

ALTER TABLE users
  ADD CONSTRAINT users_bio_check
  CHECK (bio IS NULL OR char_length(bio) <= 160);
