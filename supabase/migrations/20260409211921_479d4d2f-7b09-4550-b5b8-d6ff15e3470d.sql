
CREATE POLICY "Admins can upload downloads"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'downloads');

CREATE POLICY "Admins can update downloads"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'downloads');
