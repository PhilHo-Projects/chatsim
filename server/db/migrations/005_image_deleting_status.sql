ALTER TABLE images DROP CONSTRAINT images_status_check;

ALTER TABLE images
  ADD CONSTRAINT images_status_check
  CHECK (
    status IN (
      'pending',
      'processing',
      'ready',
      'rejected',
      'deleting',
      'deleted'
    )
  );
