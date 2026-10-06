import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { seedPrismaDomain, allTopics, findTopic, findProject } from '../src/lib/data/store';

// The store resolves the request tenant from the session and falls back to the
// host tenant 'default' when no session exists (as in tests). Rows stamped with
// a different tenantId must never be visible to that 'default' read.

test('a tenant sees only its own topics and projects', async () => {
  await seedPrismaDomain();

  await prisma.topic.create({
    data: {
      id: 't-other', tenantId: 'other', supervisorId: 'u-johnsjdsd',
      title: 'Other tenant topic', description: 'Description long enough for the other tenant.',
      prerequisites: null, tags: [], capacity: 1, groupSuitable: true,
      studentProposed: false, proposedBy: null, published: true, acceptedAt: null,
    },
  });
  await prisma.project.create({
    data: {
      id: 'p-other', tenantId: 'other', title: 'Other tenant project',
      supervisorId: 'u-johnsjdsd', memberIds: [], state: 'TOPIC_SELECTED',
      ethicsStatus: 'NOT_REQUIRED', contributionFiled: {} as never, topicId: null,
    },
  });

  const topics = await allTopics();
  assert.ok(topics.every((t) => t.id !== 't-other'), 'default tenant must not see other tenant topics');
  assert.equal(await findTopic('t-other'), null, 'findTopic must be tenant-scoped');
  assert.equal(await findProject('p-other'), null, 'findProject must be tenant-scoped');

  await prisma.topic.deleteMany({ where: { id: 't-other' } });
  await prisma.project.deleteMany({ where: { id: 'p-other' } });
});
