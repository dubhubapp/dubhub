# Supabase `post-thumbnails` bucket setup

Required for server-generated post preview JPEGs from `POST /api/upload-video`.

## Dashboard

1. Supabase project → **Storage** → **New bucket**
2. Name: `post-thumbnails`
3. **Public bucket**: enabled (public read for `og:image` and app tiles)

## Policies (if RLS enabled on `storage.objects`)

Match your existing `videos` bucket pattern. Example:

```sql
-- Public read
CREATE POLICY "post_thumbnails_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-thumbnails');

-- Service role / authenticated upload (server uses service key)
CREATE POLICY "post_thumbnails_authenticated_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'post-thumbnails'
  AND auth.role() = 'authenticated'
);
```

The API uploads with the **service role** key from Railway; ensure that key can `INSERT` into `post-thumbnails`.

## Object layout

`{userId}/thumb_{timestamp}_{randomId}.jpg`

Public URL shape validated on `POST /api/posts`:

`/storage/v1/object/public/post-thumbnails/...`
