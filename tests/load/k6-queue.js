import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Health check
  const health = http.get(`${BASE_URL}/api/v1/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  // Join queue
  const join = http.post(
    `${BASE_URL}/api/v1/queue/join`,
    JSON.stringify({
      clinicId: '00000000-0000-0000-0000-000000000001',
      anonymousHash: [...Array(64)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join(''),
      language: 'sv',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(join, { 'join 200': (r) => r.status === 200 });

  if (join.status === 200) {
    const { sessionToken } = JSON.parse(join.body).data;
    // Check status
    const status = http.get(
      `${BASE_URL}/api/v1/queue/status/${sessionToken}`,
    );
    check(status, { 'status 200': (r) => r.status === 200 });
  }

  sleep(1);
}
