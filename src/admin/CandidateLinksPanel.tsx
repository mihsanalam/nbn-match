import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  downloadCsv,
  generateLinksForEvent,
  listCandidateLinkRows,
  listRequestPairs,
  regenerateLink,
  resetLinkLock,
  revokeLink,
  type CandidateLinkRow,
  type RequestPairRow,
} from './candidate-links';
import { buildWhatsAppShareUrl, formatWhatsAppNumber, isPhoneLengthValid } from '@/lib/candidate-phone';

const buttonClass = 'rounded-md border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm hover:opacity-90';
const dangerClass = 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive shadow-sm hover:opacity-90';

function CandidateLinksPanel({ eventId, eventLabel }: { eventId: string; eventLabel: string }) {
  const [rows, setRows] = useState<CandidateLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Array<{ registration_id: string; candidate_code: string; gender: string; phone: string | null; token: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedRegistrationId, setCopiedRegistrationId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requestRows, setRequestRows] = useState<RequestPairRow[]>([]);
  const [requestFilter, setRequestFilter] = useState<'all' | 'sent' | 'accepted' | 'withdrawn'>('all');
  const [linkFilter, setLinkFilter] = useState<'all' | 'active' | 'no_link' | 'revoked' | 'locked'>('all');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [linkRows, requestPairs] = await Promise.all([
        listCandidateLinkRows(eventId),
        listRequestPairs(eventId),
      ]);
      setRows(linkRows);
      setRequestRows(requestPairs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidate links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setGeneratedLinks([]);
    setNotice(null);
    if (eventId) void loadData();
  }, [eventId]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => linkFilter === 'all' || row.link_status === linkFilter);
  }, [rows, linkFilter]);

  const rowsWithoutPhone = useMemo(
    () => rows.filter((row) => !isPhoneLengthValid(row.phone)),
    [rows],
  );

  const filteredRequests = useMemo(() => {
    return requestRows.filter((row) => {
      if (requestFilter === 'all') return true;
      return row.status === requestFilter;
    });
  }, [requestRows, requestFilter]);

  const groupedRequests = useMemo(() => {
    const groups = new Map<string, RequestPairRow[]>();
    filteredRequests.forEach((row) => {
      const existing = groups.get(row.from_code) ?? [];
      existing.push(row);
      groups.set(row.from_code, existing);
    });
    return groups;
  }, [filteredRequests]);

  const toggleUser = (userCode: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userCode)) {
        next.delete(userCode);
      } else {
        next.add(userCode);
      }
      return next;
    });
  };

  const handleGenerateLinks = async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const phoneByRegistration = new Map(rows.map((row) => [row.registration_id, row.phone]));
      const result = await generateLinksForEvent(eventId);
      setGeneratedLinks(result.map((row) => ({
        registration_id: row.out_registration_id,
        candidate_code: row.out_candidate_code,
        gender: row.out_gender,
        phone: phoneByRegistration.get(row.out_registration_id) ?? null,
        token: row.out_token,
      })));
      setNotice(result.length
        ? `Generated ${result.length} candidate link${result.length === 1 ? '' : 's'}.`
        : 'No eligible candidates need a new link for this event.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate links.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = async (registrationId: string, token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v/${token}`);
      setCopiedRegistrationId(registrationId);
      setNotice('Candidate link copied to clipboard.');
    } catch (err) {
      setError(err instanceof Error ? `Could not copy link: ${err.message}` : 'Could not copy link. Check clipboard permissions and try again.');
    }
  };

  const handleRegenerate = async (registrationId: string) => {
    const target = rows.find((row) => row.registration_id === registrationId);
    if (!target || !isPhoneLengthValid(target.phone)) {
      setError('Add a valid phone number (at least 10 digits) to this registration before generating a link.');
      return;
    }

    try {
      const token = await regenerateLink(registrationId);
      setGeneratedLinks([{
        registration_id: registrationId,
        candidate_code: target.candidate_code ?? 'regenerated',
        gender: target.gender ?? 'n/a',
        phone: target.phone,
        token,
      }]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate link.');
    }
  };

  const handleRevoke = async (registrationId: string) => {
    try {
      await revokeLink(registrationId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke link.');
    }
  };

  const handleResetLock = async (registrationId: string) => {
    try {
      await resetLinkLock(registrationId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset lock.');
    }
  };

  const handleExport = () => {
    downloadCsv(
      requestRows.map((row) => ({
        from_code: row.from_code,
        to_code: row.to_code,
        status: row.status,
        created_at: row.created_at,
        is_mutual: row.is_mutual ? 'yes' : 'no',
      })),
      'candidate-requests.csv',
    );
  };

  return (
    <div className='space-y-6'>
      <div className='rounded-md border border-border bg-card p-4'>
        <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
          <h3 className='text-lg font-semibold'>Candidate links</h3>
          <button type='button' onClick={handleGenerateLinks} disabled={generating || loading} className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}>
            {generating ? 'Generating…' : 'Generate links'}
          </button>
        </div>

        <p className='mb-3 text-sm text-muted-foreground'>
          Generate links for approved candidates in {eventLabel}. Each link is private to one candidate and requires their saved phone number to open.
        </p>

        {rowsWithoutPhone.length > 0 && (
          <div className='mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm'>
            {rowsWithoutPhone.length} approved candidate{rowsWithoutPhone.length === 1 ? '' : 's'} have no valid phone number.
            They will not get a link until a phone with at least 10 digits is saved, because a link can only be opened with the saved number.
          </div>
        )}

        {notice && (
          <p role='status' className='mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-400'>
            {notice}
          </p>
        )}

        {generatedLinks.length > 0 && (
          <div className='mb-4 space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3'>
            {generatedLinks.map((link) => (
              <div key={link.registration_id + link.token} className='flex flex-col gap-2 rounded-md bg-background p-2 sm:flex-row sm:items-center sm:justify-between'>
                <div className='min-w-0'>
                  <div className='text-xs font-medium'>
                    {link.candidate_code} · phone: {link.phone ?? 'Missing'}
                  </div>
                  <div className='font-mono text-xs break-all'>
                    {window.location.origin}/v/{link.token}
                  </div>
                  {!formatWhatsAppNumber(link.phone) && (
                    <div className='mt-1 text-xs text-amber-600'>
                      No valid WhatsApp number on file — WhatsApp will open so you can choose a contact.
                    </div>
                  )}
                </div>
                <div className='flex gap-2'>
                  <button
                    type='button'
                    onClick={() => void handleCopyLink(link.registration_id, link.token)}
                    className={buttonClass}
                  >
                    {copiedRegistrationId === link.registration_id ? 'Copied' : 'Copy link'}
                  </button>
                  <a
                    href={buildWhatsAppShareUrl(
                      link.phone,
                      `NBN Match Making Event — ${eventLabel}\n${window.location.origin}/v/${link.token}`,
                    )}
                    target='_blank'
                    rel='noreferrer'
                    className={buttonClass}
                    aria-label={`Share via WhatsApp for ${link.candidate_code}`}
                    title={formatWhatsAppNumber(link.phone)
                      ? 'Open WhatsApp with the candidate number pre-filled'
                      : 'Open WhatsApp to choose a contact and send the link'}
                  >
                    Share via WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className='mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive'>
            <p role='alert'>{error}</p>
            <button type='button' onClick={() => void loadData()} className='mt-2 underline'>Retry loading</button>
          </div>
        )}

        <div className='mb-3 flex flex-wrap gap-2'>
          {(['all', 'active', 'no_link', 'revoked', 'locked'] as const).map((value) => (
            <button key={value} type='button' onClick={() => setLinkFilter(value)} className={buttonClass}>
              {value === 'all' ? 'All' : value}
            </button>
          ))}
        </div>

        {loading ? (
          <p className='text-sm text-muted-foreground'>Loading candidate links…</p>
        ) : filteredRows.length === 0 ? (
          <p className='rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground'>
            {rows.length ? 'No candidate links match this status filter.' : 'No approved candidates are available for this event yet.'}
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full text-left text-sm'>
              <thead>
                <tr className='border-b border-border'>
                  <th className='px-2 py-2'>Code</th>
                  <th className='px-2 py-2'>Gender</th>
                  <th className='px-2 py-2'>Phone</th>
                  <th className='px-2 py-2'>Status</th>
                  <th className='px-2 py-2'>Last used</th>
                  <th className='px-2 py-2'>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.registration_id} className='border-b border-border/60'>
                    <td className='px-2 py-2 font-mono'>{row.candidate_code ?? '—'}</td>
                    <td className='px-2 py-2'>{row.gender ?? '—'}</td>
                    <td className='px-2 py-2'>
                      {row.phone ? row.phone : <span className='font-medium text-destructive'>Missing</span>}
                    </td>
                    <td className='px-2 py-2'>
                      <span className='rounded-full border border-border px-2 py-0.5 text-xs capitalize'>
                        {row.link_status}
                      </span>
                    </td>
                    <td className='px-2 py-2'>{row.last_used_at ? new Date(row.last_used_at).toLocaleString() : '—'}</td>
                    <td className='px-2 py-2'>
                      <div className='flex flex-wrap gap-2'>
                        <button
                          type='button'
                          onClick={() => handleRegenerate(row.registration_id)}
                          disabled={!isPhoneLengthValid(row.phone)}
                          title={isPhoneLengthValid(row.phone) ? undefined : 'Add a valid phone number to this registration first.'}
                          className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          Regenerate
                        </button>
                        <button type='button' onClick={() => handleRevoke(row.registration_id)} className={dangerClass}>Revoke</button>
                        <button type='button' onClick={() => handleResetLock(row.registration_id)} className={buttonClass}>Reset lock</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className='rounded-md border border-border bg-card p-4'>
        <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
          <h3 className='text-lg font-semibold'>Requests</h3>
          <button type='button' onClick={handleExport} className={buttonClass}>Export Excel</button>
        </div>

        <div className='mb-3 flex flex-wrap gap-2'>
          {(['all', 'sent', 'accepted', 'withdrawn'] as const).map((value) => (
            <button key={value} type='button' onClick={() => setRequestFilter(value)} className={buttonClass}>
              {value === 'all' ? 'All' : value}
            </button>
          ))}
        </div>

        <div className='overflow-x-auto'>
          {loading ? (
            <p className='text-sm text-muted-foreground'>Loading candidate requests…</p>
          ) : groupedRequests.size === 0 ? (
            <p className='text-sm text-muted-foreground'>No requests found.</p>
          ) : (
            <div className='space-y-2'>
              {Array.from(groupedRequests.entries()).map(([userCode, userRequests]) => (
                <div key={userCode} className='rounded-md border border-border bg-card'>
                  <button
                    type='button'
                    onClick={() => toggleUser(userCode)}
                    className='flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors'
                  >
                    <div className='flex items-center gap-2'>
                      {expandedUsers.has(userCode) ? (
                        <ChevronDown size={16} className='text-muted-foreground' />
                      ) : (
                        <ChevronRight size={16} className='text-muted-foreground' />
                      )}
                      <span className='font-mono font-medium'>{userCode}</span>
                      <span className='text-xs text-muted-foreground'>({userRequests.length} request{userRequests.length !== 1 ? 's' : ''})</span>
                    </div>
                  </button>
                  {expandedUsers.has(userCode) && (
                    <div className='border-t border-border'>
                      <table className='min-w-full text-left text-sm'>
                        <thead>
                          <tr className='border-b border-border bg-muted/30'>
                            <th className='px-3 py-2'>To</th>
                            <th className='px-3 py-2'>Status</th>
                            <th className='px-3 py-2'>Mutual</th>
                            <th className='px-3 py-2'>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userRequests.map((row) => (
                            <tr key={`${row.from_code}-${row.to_code}-${row.created_at}`} className='border-b border-border/60'>
                              <td className='px-3 py-2 font-mono'>{row.to_code}</td>
                              <td className='px-3 py-2 capitalize'>{row.status}</td>
                              <td className='px-3 py-2'>{row.is_mutual ? 'Yes' : 'No'}</td>
                              <td className='px-3 py-2'>{new Date(row.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CandidateLinksPanel;