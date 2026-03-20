import { type Database } from '../client.js';
import { organizations, clinics, users, rooms } from '../schema/index.js';

/**
 * Seeds the database with development data.
 * Run with: npx tsx packages/db/src/seeds/dev-seed.ts
 */
export async function seed(db: Database) {
  // Create organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Stockholms Vårdcentral AB',
      slug: 'stockholms-vardcentral',
      settings: {},
    })
    .returning();

  if (!org) throw new Error('Failed to create organization');

  // Create clinic
  const [clinic] = await db
    .insert(clinics)
    .values({
      organizationId: org.id,
      name: 'Kungsholmens Vårdcentral',
      slug: 'kungsholmen',
      address: 'Hantverkargatan 45, 112 21 Stockholm',
      timezone: 'Europe/Stockholm',
      defaultLanguage: 'sv',
      qrCodeSecret: 'dev-qr-secret-replace-in-production-000000000000',
      dailySalt: 'dev-daily-salt-replace-in-production-0000000000000',
      dailySaltDate: new Date().toISOString().split('T')[0]!,
      settings: {
        maxPostponements: 3,
        defaultServiceTimeSeconds: 480,
        maxQueueSize: 100,
        noShowTimerSeconds: 180,
        openingHour: 7,
        closingHour: 17,
      },
    })
    .returning();

  if (!clinic) throw new Error('Failed to create clinic');

  // Create clinic admin (password: "AdminPassword1")
  // In real usage, hash with Argon2. This is a placeholder hash.
  const [admin] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      clinicId: clinic.id,
      email: 'admin@kungsholmen.example.com',
      passwordHash: '$placeholder-hash-replace-with-argon2',
      displayName: 'Anna Adminsson',
      role: 'clinic_admin',
      preferredLanguage: 'sv',
    })
    .returning();

  if (!admin) throw new Error('Failed to create admin');

  // Create staff members
  const staffMembers = await db
    .insert(users)
    .values([
      {
        organizationId: org.id,
        clinicId: clinic.id,
        email: 'erik@kungsholmen.example.com',
        passwordHash: '$placeholder-hash-replace-with-argon2',
        displayName: 'Erik Eriksson',
        role: 'staff',
        preferredLanguage: 'sv',
      },
      {
        organizationId: org.id,
        clinicId: clinic.id,
        email: 'maria@kungsholmen.example.com',
        passwordHash: '$placeholder-hash-replace-with-argon2',
        displayName: 'Maria Johansson',
        role: 'staff',
        preferredLanguage: 'sv',
      },
    ])
    .returning();

  // Create rooms
  await db.insert(rooms).values([
    {
      organizationId: org.id,
      clinicId: clinic.id,
      name: 'Rum 1',
      displayOrder: 1,
      status: 'closed',
      currentStaffId: staffMembers[0]?.id,
    },
    {
      organizationId: org.id,
      clinicId: clinic.id,
      name: 'Rum 2',
      displayOrder: 2,
      status: 'closed',
      currentStaffId: staffMembers[1]?.id,
    },
    {
      organizationId: org.id,
      clinicId: clinic.id,
      name: 'Rum 3',
      displayOrder: 3,
      status: 'closed',
    },
  ]);

  console.log('Seed data created successfully:');
  console.log(`  Organization: ${org.name} (${org.id})`);
  console.log(`  Clinic: ${clinic.name} (${clinic.id})`);
  console.log(`  Admin: ${admin.email}`);
  console.log(`  Staff: ${staffMembers.length} members`);
  console.log('  Rooms: 3');
}
