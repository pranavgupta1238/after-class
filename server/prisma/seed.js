const { PrismaClient, RoomKind } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const campus = await prisma.campus.upsert({
    where: { slug: 'niit-university' },
    update: { name: 'NIIT University', emailDomain: 'niituniversity.in', location: 'Neemrana, Rajasthan', status: 'active' },
    create: { slug: 'niit-university', name: 'NIIT University', emailDomain: 'niituniversity.in', location: 'Neemrana, Rajasthan' }
  });
  await prisma.chatRoom.upsert({
    where: { id: `${campus.id}` },
    update: {},
    create: { id: campus.id, campusId: campus.id, kind: RoomKind.campus }
  });
  console.log(`Seeded ${campus.name} (${campus.id})`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
