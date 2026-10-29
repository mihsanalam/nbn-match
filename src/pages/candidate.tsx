import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  HeartHandshake,
  Inbox,
  KeyRound,
  Loader2,
  LockKeyhole,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  Timer,
  Undo2,
  UserRound,
} from 'lucide-react';
import {
  isPhoneLengthValid,
  normalizePhoneDigits,
} from '../lib/candidate-phone';
import './candidate.css';

const SESSION_KEY = 'nbn_candidate_session_token';
const LINK_KEY = 'nbn_candidate_link_token';
const CANDIDATE_CODE_KEY = 'nbn_candidate_code';
const CANDIDATE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

const functionHeaders = () => ({
  'Content-Type': 'application/json',
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
});

const SESSION_END_CODES = new Set(['session_invalid', 'invalid_link', 'closed', 'locked']);

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: 'This link is not valid. Please ask the organizer for a new link.',
  locked: 'This link is locked after too many wrong phone attempts. Please contact the organizer.',
  not_open: 'This link is not open yet. Please try again when the request window opens.',
  closed: 'This link has expired. The request window is closed.',
  invalid_number: 'Invalid number. Please enter a valid phone number.',
  wrong_phone: 'Invalid number. This phone number does not match the number this link was generated for.',
  phone_not_on_file: 'No phone number is saved for this registration. Please contact the organizer.',
  session_invalid: 'Your session has expired. Please reopen your personal link.',
  invalid_target: 'This profile is not available.',
  already_sent: 'You have already sent a request to this candidate.',
  limit_full: 'You have used all your requests for this link.',
  not_found: 'That request could not be found.',
  network_error: 'Connection problem. Please check your internet and try again.',
};

function errorText(code: string | null | undefined) {
  if (!code) return '';
  return ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

function clearStoredSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(LINK_KEY);
  sessionStorage.removeItem(CANDIDATE_CODE_KEY);
}

function readStoredSession(routeToken: string) {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return null;

  const savedLink = sessionStorage.getItem(LINK_KEY);
  if (routeToken && savedLink !== routeToken) {
    clearStoredSession();
    return null;
  }

  return saved;
}

async function callCandidateFunction<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${CANDIDATE_FUNCTIONS_URL}/${fn}`, {
    method: 'POST',
    headers: functionHeaders(),
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code = typeof payload?.error === 'string' ? payload.error : 'session_invalid';
    const error = new Error(code) as Error & { code?: string };
    error.code = code;
    throw error;
  }

  return payload as T;
}

type ProfileItem = {
  candidate_code: string;
  photo_path?: string | null;
  photo_url?: string | null;
  profile?: Record<string, unknown>;
  requested?: boolean;
};

type RequestItem = {
  candidate_code: string;
  status: 'sent' | 'withdrawn';
  created_at: string;
};

type CandidateOpenResponse = {
  ok: true;
  session_token: string;
  candidate_code: string;
  gender: string;
  opens_at: string;
  closes_at: string;
  server_now: string;
  max_requests: number;
  requests_used: number;
};

type CandidateProfilesResponse = {
  ok: true;
  items: ProfileItem[];
  requests_used: number;
  max_requests: number;
  closes_at: string;
  server_now: string;
};

type CandidateMyRequestsResponse = {
  ok: true;
  items: RequestItem[];
  requests_used: number;
  max_requests: number;
  closes_at: string;
  server_now: string;
};

type CandidateActionResponse = {
  ok: true;
  requests_used: number;
  max_requests: number;
};

function formatCountdown(totalSeconds: number | null) {
  if (totalSeconds === null) return 'Checking time';
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s left`;
}

function formatRequestDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CandidateChrome({ candidateCode, children }: { candidateCode?: string; children: ReactNode }) {
  return (
    <div className='candidate-app'>
      <a className='candidate-skip-link' href='#candidate-main'>Skip to content</a>
      <header className='m3-top-app-bar'>
        <div className='m3-top-app-bar__inner'>
          <div className='m3-brand'>
            <span className='m3-brand__mark' aria-hidden='true'>
              <HeartHandshake size={20} strokeWidth={2} />
            </span>
            <div>
              <p className='m3-brand__name'>NBN Match</p>
              <p className='m3-brand__sub'>Private candidate link</p>
            </div>
          </div>
          {candidateCode ? (
            <span className='m3-assist-chip'>
              <ShieldCheck size={14} aria-hidden='true' />
              {candidateCode}
            </span>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}

type StatusScreenProps = {
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  tone?: 'default' | 'warning' | 'error';
};

function StatusScreen({ icon, eyebrow = 'Candidate access', title, description, tone = 'default' }: StatusScreenProps) {
  const toneClass = tone === 'default' ? '' : ` m3-status__icon--${tone}`;

  return (
    <CandidateChrome>
      <main id='candidate-main' className='m3-main m3-main--narrow'>
        <section className='m3-status' aria-live='polite'>
          <span className={`m3-status__icon${toneClass}`} aria-hidden='true'>{icon}</span>
          <p className='m3-eyebrow'>{eyebrow}</p>
          <h1 className='m3-headline-medium'>{title}</h1>
          {description ? <p className='m3-body-large'>{description}</p> : null}
        </section>
      </main>
    </CandidateChrome>
  );
}

function CandidatePage() {
  const navigate = useNavigate();
  const params = useParams();
  const routeToken = params.token ?? '';
  const [phone, setPhone] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(() => readStoredSession(routeToken));
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [requestsUsed, setRequestsUsed] = useState(0);
  const [maxRequests, setMaxRequests] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(() => Boolean(readStoredSession(routeToken)));
  const [actioning, setActioning] = useState<Record<string, boolean>>({});
  const [serverNow, setServerNow] = useState<number | null>(null);
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const [closesAt, setClosesAt] = useState<number | null>(null);
  const [candidateCode, setCandidateCode] = useState(() => sessionStorage.getItem(CANDIDATE_CODE_KEY) ?? '');
  const [verified, setVerified] = useState(false);
  const [showPhoneForm, setShowPhoneForm] = useState(!sessionToken && !!routeToken);
  const [hasLoadedSession, setHasLoadedSession] = useState(false);
  const lastSessionRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);

  const applyServerClock = (value: string | null | undefined) => {
    if (!value) return;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      setClockOffset(parsed - Date.now());
    }
  };

  const endCandidateSession = (code: string) => {
    clearStoredSession();
    loadIdRef.current += 1;
    lastSessionRef.current = null;
    setSessionToken(null);
    setVerified(false);
    setCandidateCode('');
    setProfiles([]);
    setRequests([]);
    setRequestsUsed(0);
    setLoadingProfiles(false);
    setError(code);
    setHasLoadedSession(true);
    setShowPhoneForm(Boolean(routeToken));
  };

  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      const tag = document.createElement('meta');
      tag.name = 'robots';
      tag.content = 'noindex, nofollow';
      document.head.appendChild(tag);
    } else {
      meta.setAttribute('content', 'noindex, nofollow');
    }

    const referrer = document.querySelector('meta[name="referrer"]');
    if (!referrer) {
      const tag = document.createElement('meta');
      tag.name = 'referrer';
      tag.content = 'no-referrer';
      document.head.appendChild(tag);
    } else {
      referrer.setAttribute('content', 'no-referrer');
    }

    document.title = 'Candidate access | NBN';

    return () => {
      // leave metadata set to noindex for this route only.
    };
  }, []);

  useEffect(() => {
    if (!routeToken) {
      if (sessionToken) {
        setShowPhoneForm(false);
        setVerified(true);
      } else {
        setShowPhoneForm(false);
      }
      return;
    }

    if (!sessionToken) {
      setShowPhoneForm(true);
    }
  }, [routeToken, sessionToken]);

  const countdownSeconds = useMemo(() => {
    if (!closesAt || !serverNow) return null;
    return Math.max(0, Math.ceil((closesAt - serverNow) / 1000));
  }, [closesAt, serverNow]);

  useEffect(() => {
    if (clockOffset === null) return;
    const tick = () => setServerNow(Date.now() + clockOffset);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [clockOffset]);

  useEffect(() => {
    if (!routeToken) return;
    const savedLink = sessionStorage.getItem(LINK_KEY);
    if (savedLink === routeToken) return;

    const hadSession = Boolean(sessionToken);
    clearStoredSession();
    loadIdRef.current += 1;
    lastSessionRef.current = null;
    setSessionToken(null);
    setVerified(false);
    setCandidateCode('');
    setProfiles([]);
    setRequests([]);
    setRequestsUsed(0);
    setError(null);
    setShowPhoneForm(true);
    if (hadSession) setHasLoadedSession(false);
  }, [routeToken]);

  const loadSessionData = async (activeSessionToken: string) => {
    const loadId = ++loadIdRef.current;
    const isCurrent = () => loadId === loadIdRef.current && sessionStorage.getItem(SESSION_KEY) === activeSessionToken;

    setLoadingProfiles(true);
    setError(null);

    try {
      const [profilesRes, requestsRes] = await Promise.all([
        callCandidateFunction<CandidateProfilesResponse>('candidate-profiles', {
          session_token: activeSessionToken,
        }),
        callCandidateFunction<CandidateMyRequestsResponse>('candidate-my-requests', {
          session_token: activeSessionToken,
        }),
      ]);

      if (!isCurrent()) return;

      setProfiles(profilesRes.items ?? []);
      setRequests(requestsRes.items ?? []);
      setRequestsUsed(profilesRes.requests_used ?? requestsRes.requests_used ?? 0);
      setMaxRequests(profilesRes.max_requests ?? requestsRes.max_requests ?? 8);
      const closesAtValue = profilesRes.closes_at || requestsRes.closes_at;
      if (closesAtValue) {
        const parsedClosesAt = Date.parse(closesAtValue);
        if (Number.isFinite(parsedClosesAt)) setClosesAt(parsedClosesAt);
      }
      applyServerClock(profilesRes.server_now || requestsRes.server_now);
      setVerified(true);
      setHasLoadedSession(true);
    } catch (err) {
      if (!isCurrent()) return;

      const code = err instanceof Error && err.message ? err.message : 'session_invalid';
      if (SESSION_END_CODES.has(code)) {
        endCandidateSession(code);
      } else {
        setError('network_error');
        setHasLoadedSession(true);
      }
    } finally {
      if (loadId === loadIdRef.current) {
        setLoadingProfiles(false);
      }
    }
  };

  useEffect(() => {
    if (!sessionToken) return;
    if (lastSessionRef.current === sessionToken) return;

    lastSessionRef.current = sessionToken;
    void loadSessionData(sessionToken);
  }, [sessionToken]);

  useEffect(() => {
    if (!routeToken || !sessionToken) return;
    if (sessionStorage.getItem(LINK_KEY) !== routeToken) return;
    if (window.location.pathname !== '/v') {
      navigate('/v', { replace: true });
    }
  }, [routeToken, sessionToken, navigate]);

  const verifyPhone = async () => {
    if (verifying) return;

    if (!routeToken) {
      setError('invalid_link');
      return;
    }

    const digitsPhone = normalizePhoneDigits(phone);
    if (!isPhoneLengthValid(digitsPhone)) {
      setError('invalid_number');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const payload = await callCandidateFunction<CandidateOpenResponse>('candidate-open', {
        token: routeToken,
        phone: digitsPhone,
      });

      const code = payload.candidate_code || '';
      setCandidateCode(code);
      sessionStorage.setItem(CANDIDATE_CODE_KEY, code);
      sessionStorage.setItem(LINK_KEY, routeToken);
      sessionStorage.setItem(SESSION_KEY, payload.session_token);
      setSessionToken(payload.session_token);
      setRequestsUsed(payload.requests_used ?? 0);
      setMaxRequests(payload.max_requests ?? 8);
      setHasLoadedSession(true);
      if (payload.closes_at) {
        const parsedClosesAt = Date.parse(payload.closes_at);
        if (Number.isFinite(parsedClosesAt)) setClosesAt(parsedClosesAt);
      }
      applyServerClock(payload.server_now);
      setVerified(true);
      setShowPhoneForm(false);
      navigate('/v', { replace: true });
    } catch (err) {
      const raw = err instanceof Error && err.message ? err.message : 'invalid_link';
      setError(ERROR_MESSAGES[raw] ? raw : 'network_error');
    } finally {
      setVerifying(false);
    }
  };

  const applyAction = async (targetCode: string, type: 'send' | 'withdraw') => {
    if (!sessionToken) return;
    setActioning(prev => ({ ...prev, [targetCode]: true }));
    setError(null);

    try {
      const fn = type === 'send' ? 'candidate-send-request' : 'candidate-withdraw-request';
      const result = await callCandidateFunction<CandidateActionResponse>(fn, {
        session_token: sessionToken,
        target_code: targetCode,
      });

      setRequestsUsed(result.requests_used ?? requestsUsed);
      setMaxRequests(result.max_requests ?? maxRequests);
      await loadSessionData(sessionToken);
    } catch (err) {
      const raw = err instanceof Error && err.message ? err.message : 'session_invalid';
      const code = ERROR_MESSAGES[raw] ? raw : 'network_error';
      if (SESSION_END_CODES.has(code)) {
        endCandidateSession(code);
      } else {
        setError(code);
      }
    } finally {
      setActioning(prev => ({ ...prev, [targetCode]: false }));
    }
  };

  const hasReachedLimit = requestsUsed >= maxRequests;
  const isTimeOver = countdownSeconds !== null && countdownSeconds <= 0;

  if (!sessionToken && routeToken && !verified && showPhoneForm) {
    const phoneFieldError = error === 'invalid_number' || error === 'wrong_phone';
    const otherError = error && !phoneFieldError ? error : null;

    return (
      <CandidateChrome>
        <main id='candidate-main' className='m3-main m3-main--narrow'>
          <section className='m3-auth'>
            <span className='m3-auth__icon' aria-hidden='true'>
              <LockKeyhole size={26} strokeWidth={2} />
            </span>
            <div>
              <p className='m3-eyebrow'>Candidate access</p>
              <h1 className='m3-headline-medium'>Enter your phone number</h1>
              <p className='m3-body-large'>Use the phone saved on your registration to continue.</p>
            </div>

            {otherError ? (
              <div className='m3-alert' role='alert'>
                <AlertCircle className='m3-alert__icon' size={20} aria-hidden='true' />
                <div className='m3-alert__body'>
                  <p className='m3-alert__title'>Unable to open this link</p>
                  <p className='m3-alert__text'>{errorText(otherError)}</p>
                </div>
              </div>
            ) : null}

            <form
              className='m3-auth__form'
              onSubmit={event => {
                event.preventDefault();
                void verifyPhone();
              }}
            >
              <div>
                <label className='m3-field-label' htmlFor='candidate-phone'>Phone number</label>
                <div className='m3-text-field' data-invalid={phoneFieldError}>
                  <Phone className='m3-text-field__icon' size={20} aria-hidden='true' />
                  <input
                    id='candidate-phone'
                    type='tel'
                    inputMode='tel'
                    autoComplete='tel'
                    maxLength={20}
                    value={phone}
                    onChange={event => {
                      setPhone(event.target.value);
                      if (error) setError(null);
                    }}
                    placeholder='e.g. 01712345678'
                    aria-invalid={phoneFieldError}
                    aria-describedby='candidate-phone-help'
                  />
                </div>
              </div>

              <p
                id='candidate-phone-help'
                className={`m3-field-support${phoneFieldError ? ' m3-field-support--error' : ''}`}
                aria-live='polite'
              >
                {phoneFieldError
                  ? errorText(error)
                  : 'Use the same number you gave during registration. Country code is optional.'}
              </p>

              <button type='submit' className='m3-button m3-button--filled m3-button--block' disabled={verifying}>
                {verifying ? (
                  <>
                    <span className='m3-spinner' aria-hidden='true' />
                    Checking…
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </form>
          </section>

          <p className='m3-footer-note'>This link is personal. Do not share it with anyone else.</p>
        </main>
      </CandidateChrome>
    );
  }

  if (!sessionToken && !routeToken && !hasLoadedSession) {
    return (
      <StatusScreen
        icon={<KeyRound size={28} strokeWidth={2} />}
        title='No active session'
        description='Please use your personal link to continue.'
      />
    );
  }

  if (!sessionToken && !routeToken && hasLoadedSession) {
    return (
      <StatusScreen
        icon={<KeyRound size={28} strokeWidth={2} />}
        tone='warning'
        title='Session expired'
        description={error ? errorText(error) : 'Please reopen your personal link and verify again.'}
      />
    );
  }

  if (loadingProfiles || !sessionToken) {
    return (
      <StatusScreen
        icon={<span className='m3-spinner m3-spinner--large' aria-hidden='true' />}
        eyebrow='Loading'
        title='Loading profiles…'
        description='Please wait while we prepare your matches.'
      />
    );
  }

  if (isTimeOver) {
    return (
      <StatusScreen
        icon={<Clock3 size={28} strokeWidth={2} />}
        tone='warning'
        eyebrow='Time is over'
        title='This candidate link is no longer active'
        description='The request window has ended.'
      />
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.watermark}>Candidate code: {candidateCode || '—'}</div>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <div style={styles.badge}>Available matches</div>
            <h1 style={styles.title}>Your profile list</h1>
          </div>
          <div style={styles.countBox}>
            {countdownSeconds !== null ? `${Math.max(0, Math.floor(countdownSeconds / 60))}m ${Math.max(0, countdownSeconds % 60)}s left` : 'Checking...'}
          </div>
        </div>

        <div style={styles.counterBar}>
          <span>{requestsUsed} of {maxRequests} requests used</span>
        </div>

        {error && (
          <div style={styles.error}>
            {errorText(error)}
            {error === 'network_error' && sessionToken && (
              <button
                type='button'
                onClick={() => void loadSessionData(sessionToken)}
                style={styles.retryButton}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {hasReachedLimit && (
          <div style={styles.limitBox}>Limit Full — You have used all {maxRequests} requests for this link.</div>
        )}

        <div style={styles.profileGrid}>
          {profiles.map(profile => {
            const requested = !!profile.requested;
            const key = profile.candidate_code;
            const isBusy = !!actioning[key];
            const canSend = !requested && !hasReachedLimit;
            const profileDetails = profile.profile ? Object.entries(profile.profile) : [];
            const compactDetails = profileDetails.filter(([label]) => {
              const key = label.toLowerCase();
              return !['phone', 'email', 'guardian', 'address', 'nid', 'id', 'full name'].includes(key);
            }).slice(0, 4);

            return (
              <article key={key} style={styles.profileCard}>
                <div style={styles.imageWrap}>
                  {profile.photo_url ? (
                    <img
                      src={profile.photo_url}
                      alt={profile.candidate_code}
                      loading='lazy'
                      referrerPolicy='no-referrer'
                      style={styles.image}
                    />
                  ) : (
                    <div style={styles.imagePlaceholder}>No photo</div>
                  )}
                </div>

                <div style={styles.profileBody}>
                  <div style={styles.profileHeader}>
                    <div style={styles.codeWrap}>
                      <div style={styles.code}>{profile.candidate_code}</div>
                      {compactDetails.length > 0 && (
                        <div style={styles.profileMeta}>
                          {compactDetails.slice(0, 3).map(([label, value]) => (
                            <span key={`${key}-${label}`} style={styles.metaPill}>
                              {String(value ?? '—')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {requested ? <span style={styles.requestedChip}>Requested</span> : null}
                  </div>

                  {compactDetails.length > 0 ? (
                    <div style={styles.profileFields}>
                      {compactDetails.map(([label, value]) => (
                        <div key={`${key}-${label}`} style={styles.profileLine}>
                          <span style={styles.profileLabel}>{label}:</span>
                          <span style={styles.profileValue}>{String(value ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={styles.mutedText}>Profile details not available.</p>
                  )}
                </div>

                <button
                  type='button'
                  onClick={() => applyAction(key, requested ? 'withdraw' : 'send')}
                  disabled={isBusy || (!canSend && !requested)}
                  style={{
                    ...styles.actionButton,
                    ...(requested ? styles.withdraw : styles.send),
                    opacity: isBusy || (!canSend && !requested) ? 0.6 : 1,
                  }}
                >
                  {isBusy ? 'Please wait...' : requested ? 'Withdraw' : 'Send'}
                </button>
              </article>
            );
          })}
        </div>

        <div style={styles.requestsCard}>
          <h2 style={styles.sectionTitle}>Your requests</h2>
          {requests.length === 0 ? (
            <p style={styles.muted}>No requests yet.</p>
          ) : (
            <ul style={styles.requestList}>
              {requests.map(request => (
                <li key={`${request.candidate_code}-${request.created_at}`} style={styles.requestRow}>
                  <span>{request.candidate_code}</span>
                  <span style={request.status === 'sent' ? styles.sentStatus : styles.withdrawnStatus}>
                    {request.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#fdf5f7',
    color: '#270d15',
    fontFamily: 'system-ui, sans-serif',
    padding: '16px',
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    paddingBottom: 32,
  },
  card: {
    maxWidth: 520,
    margin: '20vh auto 0',
    background: '#ffffff',
    borderRadius: 18,
    border: '1px solid #efd2da',
    padding: 24,
    boxShadow: '0 10px 30px rgba(116, 18, 47, 0.08)',
  },
  badge: {
    display: 'inline-block',
    background: '#fbeaf0',
    color: '#7a1b42',
    padding: '6px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  title: {
    margin: '12px 0 8px',
    fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
    lineHeight: 1.2,
  },
  subtitle: {
    margin: 0,
    color: '#5f4150',
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 18,
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid #e7c9d3',
    fontSize: 16,
    outline: 'none',
  },
  button: {
    width: '100%',
    marginTop: 18,
    border: 'none',
    borderRadius: 12,
    padding: '14px 16px',
    color: '#fff',
    background: '#9c2c52',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
  },
  error: {
    marginTop: 16,
    padding: '10px 12px',
    borderRadius: 10,
    background: '#fff1f3',
    border: '1px solid #f3c5d1',
    color: '#8d2944',
    fontSize: 14,
  },
  retryButton: {
    display: 'block',
    marginTop: 10,
    border: '1px solid #d9a3b4',
    borderRadius: 8,
    background: '#ffffff',
    color: '#8d2944',
    padding: '8px 14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    marginTop: 12,
  },
  countBox: {
    background: '#ffffff',
    border: '1px solid #ecd6dc',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 700,
    color: '#7b1d46',
  },
  counterBar: {
    background: '#fef3f7',
    border: '1px solid #f0d7e0',
    borderRadius: 12,
    padding: '10px 12px',
    marginBottom: 16,
    fontWeight: 700,
  },
  profileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
    alignItems: 'stretch',
  },
  profileCard: {
    background: '#fff',
    border: '1px solid #eed6df',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 8px 16px rgba(81, 22, 32, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 330,
    width: '100%',
  },
  profileBody: {
    padding: 10,
    flex: 1,
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  codeWrap: {
    flex: 1,
    minWidth: 0,
  },
  code: {
    fontWeight: 800,
    color: '#5a1838',
    marginBottom: 0,
    fontSize: 15,
    letterSpacing: '0.04em',
  },
  profileMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  metaPill: {
    background: '#fef3f7',
    border: '1px solid #f0d7e0',
    borderRadius: 999,
    padding: '3px 7px',
    fontSize: 10,
    color: '#7a1b42',
    fontWeight: 700,
  },
  requestedChip: {
    background: '#f5ecff',
    border: '1px solid #dcc8ff',
    color: '#563c8b',
    borderRadius: 999,
    padding: '4px 7px',
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    marginTop: 2,
  },
  profileFields: {
    display: 'grid',
    gap: 6,
    marginTop: 4,
  },
  profileLine: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    fontSize: 12,
    color: '#4c2d39',
    lineHeight: 1.4,
    marginBottom: 0,
  },
  profileLabel: {
    color: '#7d4f63',
    fontWeight: 700,
    minWidth: 70,
    display: 'inline-block',
  },
  profileValue: {
    color: '#381d29',
    fontWeight: 600,
    wordBreak: 'break-word',
  },
  actionButton: {
    display: 'block',
    width: 'calc(100% - 12px)',
    margin: '0 6px 8px',
    padding: '10px 12px',
    border: 'none',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  send: {
    background: '#9c2c52',
    color: '#fff',
  },
  withdraw: {
    background: '#efeae7',
    color: '#3d2c32',
  },
  requestsCard: {
    marginTop: 20,
    background: '#fff',
    border: '1px solid #eed6df',
    borderRadius: 18,
    padding: 16,
  },
  sectionTitle: {
    margin: '0 0 12px',
    fontSize: 20,
  },
  muted: {
    color: '#6d5361',
    margin: 0,
  },
  requestList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 10,
  },
  requestRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottom: '1px solid #f3e8eb',
    paddingBottom: 8,
  },
  sentStatus: {
    color: '#2b7a4b',
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  withdrawnStatus: {
    color: '#8b5a65',
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  limitBox: {
    marginBottom: 16,
    padding: '12px 14px',
    background: '#fff3dd',
    border: '1px solid #f1d6a4',
    color: '#704b10',
    borderRadius: 12,
    fontWeight: 700,
  },
  watermark: {
    position: 'fixed',
    right: 12,
    bottom: 12,
    transform: 'rotate(-12deg)',
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: '0.12em',
    color: 'rgba(100, 30, 50, 0.15)',
    pointerEvents: 'none',
    userSelect: 'none',
  },
};

export default CandidatePage;
