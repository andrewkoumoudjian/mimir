export async function upload(
  _supabase: unknown,
  params: { path: string[]; bucket: string },
) {
  return `/${params.bucket}/${params.path.join("/")}`;
}
