-- Kehanet Postası paylaşım kurulumu (Supabase SQL Editor'de çalıştırılır)
-- Önce: Authentication > Users > kabin kullanıcısı oluştur (Auto confirm),
--       Authentication > Sign In / Providers > "Allow new users to sign up" KAPALI.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gifs', 'gifs', true, 5242880, array['image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kabin_gif_yukler" on storage.objects;
create policy "kabin_gif_yukler"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'gifs'
  and auth.uid() = 'BURAYA-KABIN-KULLANICI-UUID'::uuid
  and name ~ '^[2-9a-z]{10}\.gif$'
);

-- SELECT / UPDATE / DELETE kuralı bilerek YOK:
--   liste alınamaz, üzerine yazılamaz, siteden silinemez.
--   Okuma public URL ile; silme GitHub Actions'ta secret key ile yapılır.
