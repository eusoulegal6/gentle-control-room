
INSERT INTO storage.buckets (id, name, public) VALUES ('downloads', 'downloads', true);

CREATE POLICY "Anyone can download files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'downloads');
