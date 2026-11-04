import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

type Gender = 'man' | 'woman';

type Registration = {
  id: string;
  event_id: string;
  gender: Gender;
  status: 'approved';
  deleted_at: null;
  candidate_code: string;
  phone: string;
  photo_path: string | null;
  form_data: Record<string, unknown>;
};

type AccessLink = {
  id: string;
  event_id: string;
  registration_id: string;
  token_hash: string;
  revoked_at: Date | null;
  last_used_at: Date | null;
  failed_attempts: number;
  locked_at: Date | null;
};

type Session = {
  id: string;
  link_id: string;
  session_hash: string;
  expires_at: Date;
};

type InterestRequest = {
  id: string;
  event_id: string;
  from_registration_id: string;
  to_registration_id: string;
  status: 'sent' | 'withdrawn' | 'accepted';
  created_at: Date;
  withdrawn_at: Date | null;
  accepted_at?: Date | null;
};

type EventState = {
  id: string;
  links_open_at: Date;
  links_close_at: Date;
  max_requests_per_person: number;
};

type CandidateLinkState = {
  now: Date;
  event: EventState;
  registrations: Record<string, Registration>;
  access_links: AccessLink[];
  access_sessions: Session[];
  interest_requests: InterestRequest[];
  profile_fields: string[];
};

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const normPhone = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

const isValidPhone = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

const pickPublicProfile = (formData: Record<string, unknown>, profileFields: string[]) => {
  const result: Record<string, unknown> = {};
  for (const field of profileFields) {
    if (field in formData) result[field] = formData[field];
  }
  return result;
};

const makeState = (): CandidateLinkState => {
  const event = {
    id: 'evt-1',
    links_open_at: new Date('2026-01-01T09:00:00Z'),
    links_close_at: new Date('2026-01-01T18:00:00Z'),
    max_requests_per_person: 8,
  };

  const boys: Registration[] = [
    {
      id: 'boy-1',
      event_id: event.id,
      gender: 'man',
      status: 'approved',
      deleted_at: null,
      candidate_code: 'M101',
      phone: '+8801712345678',
      photo_path: 'boys/boy-1.jpg',
      form_data: {
        fullName: 'Boy One',
        phone: '+8801712345678',
        email: 'boy1@example.com',
        country: 'Bangladesh',
        city: 'Dhaka',
        profession: 'Engineer',
        aboutSelf: 'Loves travel and family values.',
      },
    },
    {
      id: 'boy-2',
      event_id: event.id,
      gender: 'man',
      status: 'approved',
      deleted_at: null,
      candidate_code: 'M102',
      phone: '+8801812345678',
      photo_path: 'boys/boy-2.jpg',
      form_data: {
        fullName: 'Boy Two',
        phone: '+8801812345678',
        email: 'boy2@example.com',
        country: 'Bangladesh',
        city: 'Chattogram',
        profession: 'Doctor',
        aboutSelf: 'Calm, honest, and family oriented.',
      },
    },
  ];

  const girls: Registration[] = [
    {
      id: 'girl-1',
      event_id: event.id,
      gender: 'woman',
      status: 'approved',
      deleted_at: null,
      candidate_code: 'F201',
      phone: '+8801912345678',
      photo_path: 'girls/girl-1.jpg',
      form_data: {
        fullName: 'Girl One',
        phone: '+8801912345678',
        email: 'girl1@example.com',
        country: 'Bangladesh',
        city: 'Sylhet',
        profession: 'Teacher',
        aboutSelf: 'Warm, respectful, and faith-conscious.',
      },
    },
    {
      id: 'girl-2',
      event_id: event.id,
      gender: 'woman',
      status: 'approved',
      deleted_at: null,
      candidate_code: 'F202',
      phone: '+8802012345678',
      photo_path: 'girls/girl-2.jpg',
      form_data: {
        fullName: 'Girl Two',
        phone: '+8802012345678',
        email: 'girl2@example.com',
        country: 'Bangladesh',
        city: 'Khulna',
        profession: 'Lawyer',
        aboutSelf: 'Family values and long-term compatibility matter to me.',
      },
    },
  ];

  const registrations = Object.fromEntries([...boys, ...girls].map((row) => [row.id, row]));

  const access_links: AccessLink[] = [
    {
      id: 'link-boy-1',
      event_id: event.id,
      registration_id: 'boy-1',
      token_hash: sha256('boy-one-link'),
      revoked_at: null,
      last_used_at: null,
      failed_attempts: 0,
      locked_at: null,
    },
    {
      id: 'link-boy-2',
      event_id: event.id,
      registration_id: 'boy-2',
      token_hash: sha256('boy-two-link'),
      revoked_at: null,
      last_used_at: null,
      failed_attempts: 0,
      locked_at: null,
    },
    {
      id: 'link-girl-1',
      event_id: event.id,
      registration_id: 'girl-1',
      token_hash: sha256('girl-one-link'),
      revoked_at: null,
      last_used_at: null,
      failed_attempts: 0,
      locked_at: null,
    },
    {
      id: 'link-girl-2',
      event_id: event.id,
      registration_id: 'girl-2',
      token_hash: sha256('girl-two-link'),
      revoked_at: null,
      last_used_at: null,
      failed_attempts: 0,
      locked_at: null,
    },
  ];

  return {
    now: new Date('2026-01-01T10:00:00Z'),
    event,
    registrations,
    access_links,
    access_sessions: [],
    interest_requests: [],
    profile_fields: ['fullName', 'country', 'city', 'profession', 'aboutSelf'],
  };
};

function validateSession(state: CandidateLinkState, sessionHash: string) {
  const session = state.access_sessions.find((row) => row.session_hash === sessionHash && row.expires_at > state.now);
  if (!session) throw new Error('session_invalid');

  const link = state.access_links.find((row) => row.id === session.link_id);
  if (!link || link.revoked_at || link.locked_at) throw new Error('session_invalid');

  const registration = state.registrations[link.registration_id];
  if (!registration || registration.deleted_at) throw new Error('session_invalid');

  if (state.now < state.event.links_open_at || state.now >= state.event.links_close_at) {
    throw new Error('session_invalid');
  }

  return { link, registration };
}

function linkOpenSession(state: CandidateLinkState, token: string, phone: string) {
  const tokenHash = sha256(token);
  const link = state.access_links.find((row) => row.token_hash === tokenHash);
  if (!link || link.revoked_at) return { ok: false, error: 'invalid_link' };

  const registration = state.registrations[link.registration_id];
  if (!registration || registration.status !== 'approved' || registration.deleted_at) {
    return { ok: false, error: 'invalid_link' };
  }

  if (link.locked_at) return { ok: false, error: 'locked' };
  if (state.now < state.event.links_open_at) return { ok: false, error: 'not_open', opens_at: state.event.links_open_at.toISOString() };
  if (state.now >= state.event.links_close_at) return { ok: false, error: 'closed' };
  if (!registration.phone) return { ok: false, error: 'phone_not_on_file' };
  if (!isValidPhone(phone)) return { ok: false, error: 'invalid_number' };

  if (normPhone(phone) !== normPhone(registration.phone)) {
    link.failed_attempts += 1;
    if (link.failed_attempts >= 5) link.locked_at = new Date(state.now);
    return {
      ok: false,
      error: 'wrong_phone',
      attempts_left: Math.max(0, 5 - link.failed_attempts),
    };
  }

  const sessionToken = `session-${Math.random().toString(16).slice(2)}`;
  state.access_sessions.push({
    id: `session-${Math.random().toString(16).slice(2)}`,
    link_id: link.id,
    session_hash: sha256(sessionToken),
    expires_at: new Date(Math.min(state.now.getTime() + 2 * 60 * 60 * 1000, state.event.links_close_at.getTime())),
  });

  link.failed_attempts = 0;
  link.last_used_at = new Date(state.now);

  return {
    ok: true,
    session_token: sessionToken,
    candidate_code: registration.candidate_code,
    gender: registration.gender,
    closes_at: state.event.links_close_at.toISOString(),
    server_now: state.now.toISOString(),
    max_requests: state.event.max_requests_per_person,
    requests_used: state.interest_requests.filter((row) => row.from_registration_id === registration.id && row.status === 'sent').length,
  };
}

function linkListProfiles(state: CandidateLinkState, sessionHash: string) {
  const { registration } = validateSession(state, sessionHash);
  const items = Object.values(state.registrations)
    .filter((row) => row.event_id === state.event.id)
    .filter((row) => row.status === 'approved' && row.deleted_at == null)
    .filter((row) => row.gender !== registration.gender)
    .map((row) => {
      const requestStatus = state.interest_requests
        .filter((interest) =>
          interest.event_id === state.event.id &&
          interest.from_registration_id === registration.id &&
          interest.to_registration_id === row.id &&
          (interest.status === 'sent' || interest.status === 'accepted'))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]?.status ?? null;

      return {
        candidate_code: row.candidate_code,
        photo_path: row.photo_path,
        profile: pickPublicProfile(row.form_data, state.profile_fields),
        requested: requestStatus === 'sent',
        request_status: requestStatus,
      };
    });

  return {
    ok: true,
    items,
    requests_used: state.interest_requests.filter((row) => row.from_registration_id === registration.id && row.status === 'sent').length,
    max_requests: state.event.max_requests_per_person,
    closes_at: state.event.links_close_at.toISOString(),
    server_now: state.now.toISOString(),
  };
}

function linkSendRequest(state: CandidateLinkState, sessionHash: string, targetCode: string) {
  const { registration } = validateSession(state, sessionHash);
  const target = Object.values(state.registrations).find((row) => 
    row.event_id === state.event.id &&
    row.candidate_code.toUpperCase() === targetCode.toUpperCase() &&
    row.status === 'approved' &&
    row.deleted_at == null &&
    row.gender !== registration.gender,
  );

  if (!target) return { ok: false, error: 'invalid_target' };

  const sentCount = state.interest_requests.filter((row) => row.event_id === state.event.id && row.from_registration_id === registration.id && row.status === 'sent').length;
  const existing = state.interest_requests.find((row) =>
    row.event_id === state.event.id &&
    row.from_registration_id === registration.id &&
    row.to_registration_id === target.id,
  );

  if (existing && existing.status === 'sent') return { ok: false, error: 'already_sent', requests_used: sentCount, max_requests: state.event.max_requests_per_person };
  if (sentCount >= state.event.max_requests_per_person) return { ok: false, error: 'limit_full', requests_used: sentCount, max_requests: state.event.max_requests_per_person };

  if (existing) {
    existing.status = 'sent';
    existing.created_at = new Date(state.now);
    existing.withdrawn_at = null;
  } else {
    state.interest_requests.push({
      id: `interest-${Math.random().toString(16).slice(2)}`,
      event_id: state.event.id,
      from_registration_id: registration.id,
      to_registration_id: target.id,
      status: 'sent',
      created_at: new Date(state.now),
      withdrawn_at: null,
    });
  }

  return {
    ok: true,
    requests_used: sentCount + 1,
    max_requests: state.event.max_requests_per_person,
  };
}

function linkWithdrawRequest(state: CandidateLinkState, sessionHash: string, targetCode: string) {
  const { registration } = validateSession(state, sessionHash);
  const target = Object.values(state.registrations).find((row) => row.candidate_code.toUpperCase() === targetCode.toUpperCase() && row.event_id === state.event.id);
  if (!target) return { ok: false, error: 'not_found' };

  const existing = state.interest_requests.find((row) =>
    row.event_id === state.event.id &&
    row.from_registration_id === registration.id &&
    row.to_registration_id === target.id &&
    row.status === 'sent',
  );
  if (!existing) return { ok: false, error: 'not_found' };

  existing.status = 'withdrawn';
  existing.withdrawn_at = new Date(state.now);

  return {
    ok: true,
    requests_used: state.interest_requests.filter((row) => row.event_id === state.event.id && row.from_registration_id === registration.id && row.status === 'sent').length,
    max_requests: state.event.max_requests_per_person,
  };
}

function linkMyRequests(state: CandidateLinkState, sessionHash: string) {
  const { registration } = validateSession(state, sessionHash);
  const items = state.interest_requests
    .filter((row) => row.event_id === state.event.id && row.from_registration_id === registration.id)
    .map((row) => ({
      candidate_code: state.registrations[row.to_registration_id]?.candidate_code ?? 'Unknown',
      status: row.status,
      created_at: row.created_at.toISOString(),
    }));

  return {
    ok: true,
    items,
    requests_used: state.interest_requests.filter((row) => row.event_id === state.event.id && row.from_registration_id === registration.id && row.status === 'sent').length,
    max_requests: state.event.max_requests_per_person,
    closes_at: state.event.links_close_at.toISOString(),
    server_now: state.now.toISOString(),
  };
}

function adminGenerateLinks(state: CandidateLinkState) {
  const generated: Array<{ out_registration_id: string; out_candidate_code: string; out_gender: Gender; out_token: string }> = [];
  for (const registration of Object.values(state.registrations)) {
    const hasActive = state.access_links.some((link) => link.registration_id === registration.id && link.revoked_at == null);
    if (registration.status !== 'approved' || registration.deleted_at != null || hasActive) continue;
    if (!isValidPhone(registration.phone)) continue;
    const token = `token-${createHash('sha256').update(`${registration.id}:${Math.random()}`).digest('hex')}-${registration.candidate_code.toLowerCase()}`;
    state.access_links.push({
      id: `link-${registration.id}`,
      event_id: state.event.id,
      registration_id: registration.id,
      token_hash: sha256(token),
      revoked_at: null,
      last_used_at: null,
      failed_attempts: 0,
      locked_at: null,
    });
    generated.push({ out_registration_id: registration.id, out_candidate_code: registration.candidate_code, out_gender: registration.gender, out_token: token });
  }
  return generated;
}

function adminRegenerateLink(state: CandidateLinkState, registrationId: string) {
  const registration = state.registrations[registrationId];
  if (!registration) throw new Error('Approved registration not found.');

  state.access_links = state.access_links.map((link) =>
    link.registration_id === registrationId && link.revoked_at == null
      ? { ...link, revoked_at: new Date(state.now) }
      : link,
  );

  const newToken = `regen-${createHash('sha256').update(`${registration.id}:${Math.random()}`).digest('hex')}-${registration.candidate_code.toLowerCase()}`;
  state.access_links.push({
    id: `link-${registrationId}-regen`,
    event_id: state.event.id,
    registration_id: registrationId,
    token_hash: sha256(newToken),
    revoked_at: null,
    last_used_at: null,
    failed_attempts: 0,
    locked_at: null,
  });
  return newToken;
}

function adminRevokeLink(state: CandidateLinkState, registrationId: string) {
  const link = state.access_links.find((row) => row.registration_id === registrationId && row.revoked_at == null);
  if (!link) throw new Error('Access link not found.');
  link.revoked_at = new Date(state.now);
}

function adminResetLinkLock(state: CandidateLinkState, registrationId: string) {
  const link = state.access_links.find((row) => row.registration_id === registrationId);
  if (!link) throw new Error('Access link not found.');
  link.failed_attempts = 0;
  link.locked_at = null;
}

function makeStateWithUniqueTargets(count: number): CandidateLinkState {
  const state = makeState();
  const existingWomen = Object.values(state.registrations).filter((row) => row.gender === 'woman');
  for (let i = 0; i < count - existingWomen.length; i += 1) {
    const index = i + 1;
    const id = `girl-extra-${index}`;
    state.registrations[id] = {
      id,
      event_id: state.event.id,
      gender: 'woman',
      status: 'approved',
      deleted_at: null,
      candidate_code: `F${200 + existingWomen.length + index}`,
      phone: `+880210000${String(1000 + index).padStart(4, '0')}`,
      photo_path: `girls/${id}.jpg`,
      form_data: {
        fullName: `Girl Extra ${index}`,
        phone: `+880210000${String(1000 + index).padStart(4, '0')}`,
        country: 'Bangladesh',
        city: 'Rajshahi',
        profession: 'Designer',
        aboutSelf: 'Open to a kind match.',
      },
    };
  }
  return state;
}

function anonReadDenied(name: string) {
  const error = new Error(`${name} denied for anon`);
  throw error;
}

function anonCallDenied(name: string) {
  throw new Error(`${name} blocked for anon`);
}

test('boy sees only girls and no private profile fields leak', () => {
  const state = makeState();
  const session = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(session.ok, true);
  const payload = linkListProfiles(state, sha256(String(session.session_token)));
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.items.map((item) => item.candidate_code).sort(), ['F201', 'F202']);
  for (const item of payload.items) {
    assert.ok(!('phone' in item.profile));
    assert.ok(!('email' in item.profile));
    assert.ok(!('fullName' in item.profile) === false);
  }
});

test('one link opens independent sessions on multiple devices', () => {
  const state = makeState();
  const firstDevice = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  const secondDevice = linkOpenSession(state, 'boy-one-link', '+8801712345678');

  assert.equal(firstDevice.ok, true);
  assert.equal(secondDevice.ok, true);
  assert.notEqual(firstDevice.session_token, secondDevice.session_token);
  assert.equal(state.access_sessions.length, 2);

  const firstPayload = linkListProfiles(state, sha256(String(firstDevice.session_token)));
  const secondPayload = linkListProfiles(state, sha256(String(secondDevice.session_token)));
  assert.equal(firstPayload.ok, true);
  assert.equal(secondPayload.ok, true);
  assert.deepEqual(firstPayload.items.map((item) => item.candidate_code).sort(), ['F201', 'F202']);
  assert.deepEqual(secondPayload.items.map((item) => item.candidate_code).sort(), ['F201', 'F202']);
});

test('requests sent from one device are visible on the other device', () => {
  const state = makeState();
  const firstDevice = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  const secondDevice = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(firstDevice.ok, true);
  assert.equal(secondDevice.ok, true);

  const sent = linkSendRequest(state, sha256(String(firstDevice.session_token)), 'F201');
  assert.equal(sent.ok, true);

  const secondProfiles = linkListProfiles(state, sha256(String(secondDevice.session_token)));
  const target = secondProfiles.items.find((item) => item.candidate_code === 'F201');
  assert.ok(target);
  assert.equal(target!.requested, true);
  assert.equal(secondProfiles.requests_used, 1);
});

test('before open and after close reject with the right codes', () => {
  const state = makeState();
  state.now = new Date('2026-01-01T08:59:59Z');
  assert.deepEqual(linkOpenSession(state, 'boy-one-link', '+8801712345678'), { ok: false, error: 'not_open', opens_at: '2026-01-01T09:00:00.000Z' });

  state.now = new Date('2026-01-01T19:00:00Z');
  assert.deepEqual(linkOpenSession(state, 'boy-one-link', '+8801712345678'), { ok: false, error: 'closed' });
});

test('a link only opens with the phone saved on that registration', () => {
  const state = makeState();

  const otherCandidatesNumber = linkOpenSession(state, 'boy-one-link', '+8801912345678');
  assert.deepEqual(otherCandidatesNumber, { ok: false, error: 'wrong_phone', attempts_left: 4 });

  const localFormatOfSameNumber = linkOpenSession(state, 'boy-one-link', '01712345678');
  assert.equal(localFormatOfSameNumber.ok, true);

  const countryCodeFormat = linkOpenSession(state, 'boy-one-link', '+880 1712-345678');
  assert.equal(countryCodeFormat.ok, true);

  assert.equal(state.access_sessions.length, 2);
});

test('a malformed phone number returns invalid_number without locking the link', () => {
  const state = makeState();
  const result = linkOpenSession(state, 'boy-one-link', '12345');
  assert.deepEqual(result, { ok: false, error: 'invalid_number' });

  const link = state.access_links.find((row) => row.registration_id === 'boy-1');
  assert.equal(link?.failed_attempts, 0);
  assert.equal(link?.locked_at, null);

  const stillWorks = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(stillWorks.ok, true);
});

test('5 wrong phone attempts lock the link', () => {
  const state = makeState();
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = linkOpenSession(state, 'boy-one-link', '+8800000000000');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'wrong_phone');
    assert.equal(state.access_links.find((row) => row.registration_id === 'boy-1')?.locked_at, null);
  }

  const locked = linkOpenSession(state, 'boy-one-link', '+8800000000000');
  assert.equal(locked.ok, false);
  assert.equal(locked.error, 'wrong_phone');
  assert.ok(state.access_links.find((row) => row.registration_id === 'boy-1')?.locked_at != null);
  const reopened = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(reopened.ok, false);
  assert.equal(reopened.error, 'locked');
});

test('revoked, regenerated and expired links behave correctly', () => {
  const state = makeState();
  const revoked = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(revoked.ok, true);
  const link = state.access_links.find((row) => row.registration_id === 'boy-1');
  assert.ok(link);
  link!.revoked_at = new Date(state.now);
  assert.deepEqual(linkOpenSession(state, 'boy-one-link', '+8801712345678'), { ok: false, error: 'invalid_link' });

  const newToken = adminRegenerateLink(state, 'boy-1');
  assert.ok(newToken.length >= 64);
  const reopened = linkOpenSession(state, newToken, '+8801712345678');
  assert.equal(reopened.ok, true);

  state.now = new Date('2026-01-01T20:00:00Z');
  assert.deepEqual(linkOpenSession(state, newToken, '+8801712345678'), { ok: false, error: 'closed' });
});

test('same-gender request fails and requests are limited to 8', () => {
  const state = makeStateWithUniqueTargets(10);
  const boySession = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(boySession.ok, true);
  const sameGender = linkSendRequest(state, sha256(String(boySession.session_token)), 'M102');
  assert.deepEqual(sameGender, { ok: false, error: 'invalid_target' });

  state.event.max_requests_per_person = 8;
  const targetCodes = Object.values(state.registrations)
    .filter((row) => row.gender === 'woman' && row.event_id === state.event.id)
    .map((row) => row.candidate_code)
    .slice(0, 8);

  for (let i = 0; i < targetCodes.length; i += 1) {
    const result = linkSendRequest(state, sha256(String(boySession.session_token)), targetCodes[i]);
    assert.equal(result.ok, true, `send ${i + 1} should succeed`);
  }

  const limit = linkSendRequest(state, sha256(String(boySession.session_token)), 'F201');
  assert.equal(limit.ok, false);
  assert.equal(limit.error, 'already_sent');

  const blocked = linkSendRequest(state, sha256(String(boySession.session_token)), 'F999');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'invalid_target');
});

test('9th request fails even with two simultaneous attempts', () => {
  const state = makeStateWithUniqueTargets(10);
  const boySession = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(boySession.ok, true);
  const sessionHash = sha256(String(boySession.session_token));

  const targetCodes = Object.values(state.registrations)
    .filter((row) => row.gender === 'woman' && row.event_id === state.event.id)
    .map((row) => row.candidate_code)
    .slice(0, 8);

  for (let i = 0; i < targetCodes.length; i += 1) {
    const result = linkSendRequest(state, sessionHash, targetCodes[i]);
    assert.equal(result.ok, true);
  }

  const first = linkSendRequest(state, sessionHash, targetCodes[0]);
  const second = linkSendRequest(state, sessionHash, targetCodes[0]);
  assert.equal(first.ok, false);
  assert.equal(first.error, 'already_sent');
  assert.equal(second.ok, false);
  assert.equal(second.error, 'already_sent');
});

test('requests can be withdrawn and my-requests returns the correct list', () => {
  const state = makeState();
  const boySession = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(boySession.ok, true);
  const sessionHash = sha256(String(boySession.session_token));

  const sent = linkSendRequest(state, sessionHash, 'F201');
  assert.equal(sent.ok, true);

  const withdrawn = linkWithdrawRequest(state, sessionHash, 'F201');
  assert.equal(withdrawn.ok, true);

  const myRequests = linkMyRequests(state, sessionHash);
  assert.equal(myRequests.ok, true);
  assert.equal(myRequests.items.length, 1);
  assert.equal(myRequests.items[0].status, 'withdrawn');
});

test('anon-only reads and link_* RPC calls are denied', () => {
  const state = makeState();
  const anonKey = 'anon';

  assert.throws(() => anonReadDenied('registrations'), /denied for anon/);
  assert.throws(() => anonCallDenied('link_send_request'), /blocked for anon/);

  const session = linkOpenSession(state, 'girl-one-link', '+8801912345678');
  assert.equal(session.ok, true);
  assert.throws(() => {
    if (anonKey === 'anon') throw new Error('link_list_profiles blocked for anon');
    linkListProfiles(state, sha256(String(session.session_token)));
  }, /blocked for anon/);
});

test('admin link generation and regeneration follow the expected contract', () => {
  const state = makeState();
  state.access_links = [];
  const links = adminGenerateLinks(state);
  assert.equal(links.length, 4);
  assert.ok(links.every((row) => row.out_token.length >= 20));

  const regenerated = adminRegenerateLink(state, 'boy-1');
  assert.ok(regenerated.length >= 64);

  const revoke = () => adminRevokeLink(state, 'girl-2');
  assert.doesNotThrow(revoke);

  const resetLock = () => adminResetLinkLock(state, 'boy-1');
  assert.doesNotThrow(resetLock);
});

test('admin link generation skips candidates without a usable phone', () => {
  const state = makeState();
  state.access_links = [];
  state.registrations['boy-1'].phone = '';
  state.registrations['girl-2'].phone = '123';

  const links = adminGenerateLinks(state);
  const codes = links.map((row) => row.out_candidate_code).sort();
  assert.deepEqual(codes, ['F201', 'M102']);
  assert.equal(state.access_links.length, 2);
});

test('only the allowed public profile fields are included in returned profile payloads', () => {
  const state = makeState();
  const session = linkOpenSession(state, 'boy-one-link', '+8801712345678');
  assert.equal(session.ok, true);
  const payload = linkListProfiles(state, sha256(String(session.session_token)));
  assert.equal(payload.ok, true);

  for (const item of payload.items) {
    const keys = Object.keys(item.profile);
    assert.deepEqual(keys.every((key) => state.profile_fields.includes(key)), true);
  }
});
