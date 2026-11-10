const { PrismaClient, RoomKind } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const campus = await prisma.campus.upsert({
    where: { slug: 'niit-university' },
    update: {},
    create: { slug: 'niit-university', name: 'NIIT University', emailDomain: 'niituniversity.in', location: 'Neemrana, Rajasthan', accessPolicy: {domains:[{domain:'st.niituniversity.in',role:'student'},{domain:'niituniversity.in',role:'roster'}],members:[]} }
  });
  await prisma.chatRoom.upsert({
    where: { id: `${campus.id}` },
    update: {},
    create: { id: campus.id, campusId: campus.id, kind: RoomKind.campus }
  });
  console.log(`Seeded ${campus.name} (${campus.id})`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
