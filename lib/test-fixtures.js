import bcrypt from 'bcryptjs'

export const TEST_CREDENTIALS = {
  company: {
    email: 'test.company@lantix.local',
    password: 'LantixTest2026!',
    role: 'company',
  },
  crew: {
    email: 'test.crew@lantix.local',
    password: 'LantixTest2026!',
    role: 'crew',
  },
  admin: {
    email: 'test.admin@lantix.local',
    password: 'LantixTest2026!',
    role: 'admin',
  },
}

let seedTestAccountsPromise = null

export async function seedTestAccounts(database) {
  if (!database) return

  const companyEmail = TEST_CREDENTIALS.company.email
  const crewEmail = TEST_CREDENTIALS.crew.email
  const adminEmail = TEST_CREDENTIALS.admin.email
  const defaultPassword = TEST_CREDENTIALS.company.password

  const passwordHash = await bcrypt.hash(defaultPassword, 10)

  // 1. Company test account
  let companyUser = await database.collection('users').findOne({ email: companyEmail })
  const companyUserId = companyUser ? companyUser.id : 'test-company-user-id'

  if (!companyUser) {
    const userDoc = {
      id: companyUserId,
      email: companyEmail,
      name: 'Test Production Company',
      picture: 'https://ui-avatars.com/api/?name=Test+Company&background=6d28d9&color=fff',
      role: 'company',
      passwordHash,
      createdAt: new Date(),
      isTestAccount: true,
    }
    await database.collection('users').insertOne(userDoc)
    companyUser = userDoc
  } else if (!companyUser.passwordHash) {
    await database.collection('users').updateOne(
      { id: companyUser.id },
      { $set: { passwordHash, role: 'company' } }
    )
  }

  const existingCompany = await database.collection('companies').findOne({ userId: companyUserId })
  if (!existingCompany) {
    await database.collection('companies').insertOne({
      id: 'test-company-id',
      userId: companyUserId,
      name: 'Test Production Company',
      companyType: 'Production House',
      logo: 'https://ui-avatars.com/api/?name=Test+Company&background=6d28d9&color=fff&bold=true',
      phone: '+16175550199',
      email: companyEmail,
      website: 'https://lantix.local',
      city: 'Boston',
      state: 'MA',
      description: 'Temporary test production company for verification in Google AI Studio.',
      paidVerified: true,
      subscriptionStatus: 'active',
      createdAt: new Date(),
      isTestAccount: true,
    })
  } else if (!existingCompany.paidVerified || existingCompany.subscriptionStatus !== 'active') {
    await database.collection('companies').updateOne(
      { id: existingCompany.id },
      { $set: { paidVerified: true, subscriptionStatus: 'active', updatedAt: new Date() } }
    )
  }

  // 2. Crew test account
  let crewUser = await database.collection('users').findOne({ email: crewEmail })
  const crewUserId = crewUser ? crewUser.id : 'test-crew-user-id'

  if (!crewUser) {
    const userDoc = {
      id: crewUserId,
      email: crewEmail,
      name: 'Test Crew Member',
      picture: 'https://ui-avatars.com/api/?name=Test+Crew&background=6d28d9&color=fff',
      role: 'crew',
      passwordHash,
      createdAt: new Date(),
      isTestAccount: true,
    }
    await database.collection('users').insertOne(userDoc)
    crewUser = userDoc
  } else if (!crewUser.passwordHash) {
    await database.collection('users').updateOne(
      { id: crewUser.id },
      { $set: { passwordHash, role: 'crew' } }
    )
  }

  const existingCrewProfile = await database.collection('crew_profiles').findOne({ userId: crewUserId })
  if (!existingCrewProfile) {
    await database.collection('crew_profiles').insertOne({
      id: 'test-crew-profile-id',
      userId: crewUserId,
      fullName: 'Test Crew Member',
      photo: 'https://randomuser.me/api/portraits/men/45.jpg',
      cell: '+16175550188',
      email: crewEmail,
      skills: ['FOH Engineer', 'A1', 'System Tech'],
      primaryCategory: 'Audio',
      dayRate: 450,
      city: 'Boston',
      state: 'MA',
      available: true,
      unionMember: false,
      bio: 'Experienced live sound engineer and event specialist.',
      ratingAvg: 5.0,
      ratingCount: 12,
      certs: [{ name: 'OSHA', expiry: '2027-12-31', file: '', fileType: '', fileName: '' }],
      smsConsent: true,
      smsConsentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      isTestAccount: true,
    })
  }

  // 3. Master Admin test account
  let adminUser = await database.collection('users').findOne({ email: adminEmail })
  const adminUserId = adminUser ? adminUser.id : 'test-admin-user-id'

  if (!adminUser) {
    const userDoc = {
      id: adminUserId,
      email: adminEmail,
      name: 'Test Master Admin',
      picture: 'https://ui-avatars.com/api/?name=Test+Admin&background=6d28d9&color=fff',
      role: 'admin',
      passwordHash,
      createdAt: new Date(),
      isTestAccount: true,
    }
    await database.collection('users').insertOne(userDoc)
    adminUser = userDoc
  } else if (!adminUser.passwordHash) {
    await database.collection('users').updateOne(
      { id: adminUser.id },
      { $set: { passwordHash, role: 'admin' } }
    )
  }
}

export async function ensureTestAccountsSeeded(database) {
  if (!seedTestAccountsPromise) {
    seedTestAccountsPromise = seedTestAccounts(database).catch((err) => {
      console.warn('[AI Studio] Test accounts seed error:', err?.message)
      seedTestAccountsPromise = null
    })
  }
  return seedTestAccountsPromise
}
