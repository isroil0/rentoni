import { describe, expect, it } from 'vitest';
import { API, app, as, createAdmin, createCustomer, prisma, request } from './helpers';

describe('authentication', () => {
  it('registers a customer and returns tokens without exposing the password hash', async () => {
    const res = await request(app())
      .post(`${API}/auth/register`)
      .send({ name: 'Jane Buyer', email: 'jane@test.local', password: 'Passw0rd!' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('CUSTOMER');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('Passw0rd!');
  });

  it('never lets a public registration create a SUPER_ADMIN', async () => {
    const res = await request(app())
      .post(`${API}/auth/register`)
      .send({
        name: 'Sneaky',
        email: 'sneaky@test.local',
        password: 'Passw0rd!',
        role: 'SUPER_ADMIN',
      })
      .expect(422);

    // `role` is not part of the schema at all, so the request is rejected outright.
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })).toBe(0);
  });

  it('rejects a weak password', async () => {
    const res = await request(app())
      .post(`${API}/auth/register`)
      .send({ name: 'Weak', email: 'weak@test.local', password: 'short' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate email', async () => {
    await createCustomer({ email: 'dupe@test.local' });
    const res = await request(app())
      .post(`${API}/auth/register`)
      .send({ name: 'Dupe', email: 'dupe@test.local', password: 'Passw0rd!' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('logs in with valid credentials and rejects invalid ones', async () => {
    await createCustomer({ email: 'login@test.local', password: 'Passw0rd!' });

    await request(app())
      .post(`${API}/auth/login`)
      .send({ email: 'login@test.local', password: 'Passw0rd!' })
      .expect(200);

    const bad = await request(app())
      .post(`${API}/auth/login`)
      .send({ email: 'login@test.local', password: 'WrongPass1' })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');

    // An unknown email must give the same error as a wrong password.
    const unknown = await request(app())
      .post(`${API}/auth/login`)
      .send({ email: 'nobody@test.local', password: 'Passw0rd!' })
      .expect(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns the current user from /auth/me', async () => {
    const customer = await createCustomer();
    const res = await request(app()).get(`${API}/auth/me`).set(as(customer)).expect(200);
    expect(res.body.data.email).toBe(customer.email);
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('protects endpoints that require a token', async () => {
    const res = await request(app()).get(`${API}/auth/me`).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');

    const bad = await request(app())
      .get(`${API}/auth/me`)
      .set({ Authorization: 'Bearer not-a-real-token' })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_TOKEN');
  });

  it('invalidates the access token on logout', async () => {
    const customer = await createCustomer();
    await request(app()).get(`${API}/auth/me`).set(as(customer)).expect(200);
    await request(app()).post(`${API}/auth/logout`).set(as(customer)).expect(200);

    // The JWT itself is still unexpired, but its session is revoked.
    const res = await request(app()).get(`${API}/auth/me`).set(as(customer)).expect(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('rotates refresh tokens and rejects a reused one', async () => {
    const customer = await createCustomer();
    const first = await request(app())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: customer.refreshToken })
      .expect(200);
    expect(first.body.data.accessToken).toBeTruthy();

    const replay = await request(app())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: customer.refreshToken })
      .expect(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('blocks login for a deactivated account', async () => {
    const customer = await createCustomer({ email: 'inactive@test.local', password: 'Passw0rd!' });
    await prisma.user.update({ where: { id: customer.id }, data: { active: false } });

    const res = await request(app())
      .post(`${API}/auth/login`)
      .send({ email: 'inactive@test.local', password: 'Passw0rd!' })
      .expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('changes a password and revokes existing sessions', async () => {
    const customer = await createCustomer({ password: 'Passw0rd!' });
    await request(app())
      .post(`${API}/auth/change-password`)
      .set(as(customer))
      .send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd!' })
      .expect(200);

    await request(app()).get(`${API}/auth/me`).set(as(customer)).expect(401);
    await request(app())
      .post(`${API}/auth/login`)
      .send({ email: customer.email, password: 'NewPassw0rd!' })
      .expect(200);
  });

  describe('SUPER_ADMIN bootstrap', () => {
    it('creates the first admin with a valid setup token, then refuses to run again', async () => {
      const res = await request(app())
        .post(`${API}/auth/bootstrap-admin`)
        .send({
          name: 'Owner',
          email: 'owner@test.local',
          password: 'Admin@12345',
          setupToken: 'test-setup-token',
        })
        .expect(201);
      expect(res.body.data.role).toBe('SUPER_ADMIN');

      const second = await request(app())
        .post(`${API}/auth/bootstrap-admin`)
        .send({
          name: 'Second Owner',
          email: 'owner2@test.local',
          password: 'Admin@12345',
          setupToken: 'test-setup-token',
        })
        .expect(409);
      expect(second.body.error.code).toBe('SETUP_ALREADY_COMPLETE');
    });

    it('rejects a wrong setup token', async () => {
      const res = await request(app())
        .post(`${API}/auth/bootstrap-admin`)
        .send({
          name: 'Impostor',
          email: 'impostor@test.local',
          password: 'Admin@12345',
          setupToken: 'wrong-token',
        })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  it('gives an admin a working token', async () => {
    const admin = await createAdmin();
    const res = await request(app()).get(`${API}/auth/me`).set(as(admin)).expect(200);
    expect(res.body.data.role).toBe('SUPER_ADMIN');
  });
});
