import { supabase } from '@/lib/supabase';

export type CandidateLinkRow = {
  registration_id: string;
  candidate_code: string | null;
  gender: string | null;
  phone: string | null;
  status: string | null;
  link_status: 'no_link' | 'active' | 'revoked' | 'locked';
  last_used_at: string | null;
  revoked_at: string | null;
  locked_at: string | null;
  failed_attempts: number | null;
  created_at: string | null;
};

export type LinkTokenRow = {
  out_registration_id: string;
  out_candidate_code: string;
  out_gender: string;
  out_token: string;
};

export type RequestPairRow = {
  event_id: string;
  from_code: string;
  to_code: string;
  status: 'sent' | 'withdrawn' | 'accepted';
  created_at: string;
  is_mutual: boolean;
};

export async function listCandidateLinkRows(eventId: string): Promise<CandidateLinkRow[]> {
  const [{ data: registrations, error: regError }, { data: links, error: linkError }] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, candidate_code, gender, status, phone')
      .eq('event_id', eventId)
      .eq('status', 'approved')
      .is('deleted_at', null),
    supabase
      .from('access_links')
      .select('id, event_id, registration_id, created_at, revoked_at, last_used_at, failed_attempts, locked_at')
      .eq('event_id', eventId),
  ]);

  if (regError) throw regError;
  if (linkError) throw linkError;

  const linkMap = new Map<string, any>();
  for (const row of links ?? []) {
    linkMap.set(row.registration_id, row);
  }

  return (registrations ?? []).map((registration) => {
    const link = linkMap.get(registration.id);
    let link_status: CandidateLinkRow['link_status'] = 'no_link';
    if (link) {
      if (link.revoked_at) link_status = 'revoked';
      else if (link.locked_at) link_status = 'locked';
      else link_status = 'active';
    }

    return {
      registration_id: registration.id,
      candidate_code: registration.candidate_code,
      gender: registration.gender,
      phone: registration.phone,
      status: registration.status,
      link_status,
      last_used_at: link?.last_used_at ?? null,
      revoked_at: link?.revoked_at ?? null,
      locked_at: link?.locked_at ?? null,
      failed_attempts: link?.failed_attempts ?? null,
      created_at: link?.created_at ?? null,
    };
  });
}

export async function generateLinksForEvent(eventId: string): Promise<LinkTokenRow[]> {
  const { data, error } = await supabase.rpc('admin_generate_links', { p_event_id: eventId });
  if (error) throw error;
  return (data ?? []) as LinkTokenRow[];
}

export async function regenerateLink(registrationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_regenerate_link', { p_registration_id: registrationId });
  if (error) throw error;
  return data as string;
}

export async function revokeLink(registrationId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_revoke_link', { p_registration_id: registrationId });
  if (error) throw error;
}

export async function resetLinkLock(registrationId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_link_lock', { p_registration_id: registrationId });
  if (error) throw error;
}

export async function listRequestPairs(eventId: string): Promise<RequestPairRow[]> {
  const { data, error } = await supabase
    .from('admin_request_pairs')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as RequestPairRow[];
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [columns.join(',')]
    .concat(rows.map((row) => columns.map((column) => escape(row[column])).join(',')))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
