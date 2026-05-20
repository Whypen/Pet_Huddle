revoke all on function public.send_discovery_wave(uuid) from public, anon;
revoke all on function public.accept_mutual_wave(uuid) from public, anon;

grant execute on function public.send_discovery_wave(uuid) to authenticated, service_role;
grant execute on function public.accept_mutual_wave(uuid) to authenticated, service_role;
