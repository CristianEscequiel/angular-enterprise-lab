// Verificación de contrato (spec 018, T11) contra la API real con el perfil dev.
const base = 'http://localhost:8080';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

const users = [
  ['admin', 'admin123', 'administrador'],
  ['teamleader', 'teamleader123', 'team-leader-mantenimiento'],
  ['produccion', 'produccion123', 'personal-produccion'],
  ['tecnico', 'tecnico123', 'tecnico'],
  ['electricista', 'electricista123', 'tecnico'],
];
const tokens = {};

for (const [username, password, role] of users) {
  const r = await call('POST', '/auth/login', { body: { username, password } });
  const user = r.json?.user;
  tokens[username] = r.json?.token;
  const techOk = role !== 'tecnico' || (user?.legajo && user?.specialty && user?.teamType);
  const staffOk = role === 'tecnico' || (!user?.legajo && !user?.specialty && !user?.teamType);
  ok(
    `login ${username}`,
    r.status === 200 &&
      r.json?.token &&
      user?.role === role &&
      techOk &&
      staffOk &&
      user?.displayName,
    `${user?.role} / ${user?.displayName}` +
      (user?.legajo ? ` / ${user.legajo} ${user.specialty} ${user.teamType}` : ''),
  );
  const me = await call('GET', '/auth/me', { token: tokens[username] });
  ok(
    `/auth/me ${username} devuelve el mismo user`,
    me.status === 200 && JSON.stringify(me.json) === JSON.stringify(user),
  );
}

// Errores de login / token
const bad = await call('POST', '/auth/login', { body: { username: 'admin', password: 'mala' } });
ok(
  'login con credenciales malas → 401 INVALID_CREDENTIALS',
  bad.status === 401 && bad.json?.code === 'INVALID_CREDENTIALS',
  JSON.stringify(bad.json),
);
const noTok = await call('GET', '/auth/me');
ok('/auth/me sin token → 401', noTok.status === 401, JSON.stringify(noTok.json));
const altered = await call('GET', '/auth/me', { token: tokens.admin.slice(0, -3) + 'abc' });
ok('token alterado → 401', altered.status === 401, JSON.stringify(altered.json));

// CORS
const pre = await call('OPTIONS', '/work-orders', {
  headers: {
    Origin: 'http://localhost:4200',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
  },
});
ok(
  'CORS preflight desde :4200',
  pre.status === 200 && pre.headers.get('access-control-allow-origin') === 'http://localhost:4200',
  `${pre.status} ${pre.headers.get('access-control-allow-origin')}`,
);

const A = tokens.admin;
const TL = tokens.teamleader;
const P = tokens.produccion;
const T = tokens.tecnico;
const E = tokens.electricista;

// Técnicos y equipos
let r = await call('GET', '/technicians', { token: TL });
ok(
  'GET /technicians (team leader)',
  r.status === 200 && Array.isArray(r.json) && r.json.length >= 3,
);
r = await call('GET', '/technicians/1001', { token: A });
ok(
  'GET /technicians/1001',
  r.status === 200 && r.json?.legajo === '1001' && r.json?.id !== '1001',
  `id=${r.json?.id}`,
);
r = await call('GET', '/technicians/9999', { token: A });
ok('GET /technicians/9999 → 404', r.status === 404, r.json?.code);
r = await call('GET', '/technicians', { token: T });
ok('GET /technicians (técnico) → 403', r.status === 403);
const legajo = String(5000 + (Date.now() % 4000));
r = await call('POST', '/technicians', {
  token: A,
  body: {
    legajo,
    firstName: 'Prueba',
    lastName: 'Spec018',
    specialty: 'general',
    teamType: 'guardia',
  },
});
ok('POST /technicians', r.status === 201, `legajo ${legajo}`);
r = await call('POST', '/technicians', {
  token: A,
  body: {
    legajo,
    firstName: 'Prueba',
    lastName: 'Spec018',
    specialty: 'general',
    teamType: 'guardia',
  },
});
ok(
  'POST /technicians repetido → 409 DUPLICATE_LEGAJO',
  r.status === 409 && r.json?.code === 'DUPLICATE_LEGAJO',
  JSON.stringify(r.json?.code),
);
r = await call('PUT', `/technicians/${legajo}`, {
  token: A,
  body: {
    legajo,
    firstName: 'Prueba2',
    lastName: 'Spec018',
    specialty: 'mecanico',
    teamType: 'guardia',
  },
});
ok('PUT /technicians/{legajo}', r.status === 200 && r.json?.firstName === 'Prueba2');
r = await call('DELETE', `/technicians/1001`, { token: A });
ok(
  'DELETE técnico con login → 409 TECHNICIAN_IN_USE',
  r.status === 409 && r.json?.code === 'TECHNICIAN_IN_USE',
  r.json?.message,
);
r = await call('DELETE', `/technicians/${legajo}`, { token: A });
ok('DELETE técnico libre → 204', r.status === 204);
r = await call('GET', '/teams', { token: TL });
ok('GET /teams (team leader)', r.status === 200 && Array.isArray(r.json));
r = await call('GET', '/teams', { token: A });
ok('GET /teams (admin) → 403', r.status === 403);
r = await call('POST', '/teams', {
  token: TL,
  body: { name: 'Equipo spec018', type: 'guardia', memberLegajos: ['9998'] },
});
ok(
  'POST /teams con legajo inexistente → 400 UNKNOWN_TECHNICIAN',
  r.status === 400 && r.json?.code === 'UNKNOWN_TECHNICIAN',
  JSON.stringify(r.json?.code),
);
r = await call('POST', '/teams', {
  token: TL,
  body: { name: 'Equipo spec018', type: 'guardia', memberLegajos: ['1003'] },
});
ok('POST /teams', r.status === 201, `id ${r.json?.id}`);
const teamId = r.json?.id;
r = await call('PUT', `/teams/${teamId}`, {
  token: TL,
  body: { name: 'Equipo spec018b', type: 'guardia', memberLegajos: ['1003', '1001'] },
});
ok(
  'PUT /teams/{id} (sin id en el cuerpo)',
  r.status === 200 && r.json?.memberLegajos?.length === 2,
);
r = await call('DELETE', `/teams/${teamId}`, { token: TL });
ok('DELETE /teams/{id}', r.status === 204);

// Máquinas y partes
const code = 'S18-' + (Date.now() % 100000);
r = await call('POST', '/machines', {
  token: TL,
  body: { code: code.toLowerCase(), name: 'Máquina spec018' },
});
ok(
  'POST /machines (código normalizado)',
  r.status === 201 && r.json?.code === code && r.json?.partCount === 0,
  JSON.stringify(r.json),
);
const machineId = r.json?.id;
r = await call('POST', '/machines', { token: TL, body: { code, name: 'Otra' } });
ok(
  'POST /machines repetida → 409 DUPLICATE_MACHINE_CODE',
  r.status === 409 && r.json?.code === 'DUPLICATE_MACHINE_CODE',
);
r = await call('POST', `/machines/${machineId}/parts`, {
  token: TL,
  body: { name: 'Cinta', parentId: null },
});
ok(
  'POST /machines/{id}/parts (primer nivel)',
  r.status === 201 && r.json?.parentId === null,
  JSON.stringify(r.json),
);
const partA = r.json?.id;
r = await call('POST', `/machines/${machineId}/parts`, {
  token: TL,
  body: { name: 'Motor', parentId: partA },
});
ok('POST sub-parte', r.status === 201 && r.json?.parentId === partA);
const partB = r.json?.id;
r = await call('POST', `/machines/${machineId}/parts`, {
  token: TL,
  body: { name: 'X', parentId: '1' },
});
ok(
  'POST parte con padre de otra máquina → 400 PARENT_PART_OTHER_MACHINE',
  r.status === 400 && r.json?.code === 'PARENT_PART_OTHER_MACHINE',
  r.json?.code,
);
r = await call('POST', `/machines/${machineId}/parts`, {
  token: TL,
  body: { name: 'X', parentId: '99999' },
});
ok(
  'POST parte con padre inexistente → 400 PARENT_PART_NOT_FOUND',
  r.status === 400 && r.json?.code === 'PARENT_PART_NOT_FOUND',
  r.json?.code,
);
r = await call('GET', `/machines/${machineId}/parts`, { token: T });
ok('GET /machines/{id}/parts (lista plana)', r.status === 200 && r.json?.length === 2);
r = await call('GET', `/machines/${machineId}`, { token: T });
ok('GET /machines/{id} trae partCount 2', r.status === 200 && r.json?.partCount === 2);
r = await call('PATCH', `/parts/${partA}`, { token: TL, body: { name: 'Cinta 2' } });
ok('PATCH /parts/{id} solo nombre', r.status === 200 && r.json?.name === 'Cinta 2');
r = await call('DELETE', `/parts/${partA}`, { token: TL });
ok(
  'DELETE parte con hijos → 409 PART_HAS_CHILDREN',
  r.status === 409 && r.json?.code === 'PART_HAS_CHILDREN',
  r.json?.message,
);
r = await call('DELETE', `/machines/${machineId}`, { token: TL });
ok(
  'DELETE máquina con partes → 409 MACHINE_HAS_PARTS',
  r.status === 409 && r.json?.code === 'MACHINE_HAS_PARTS',
  r.json?.message,
);
r = await call('POST', '/machines', { token: T, body: { code: 'ZZ-1', name: 'x' } });
ok('POST /machines (técnico) → 403', r.status === 403);

// Órdenes
r = await call('GET', '/work-orders?page=1&size=5', { token: T });
ok(
  'GET /work-orders paginado',
  r.status === 200 &&
    r.json?.data?.length === 5 &&
    r.json?.page === 1 &&
    r.json?.size === 5 &&
    r.json?.totalItems >= 32 &&
    typeof r.json?.totalPages === 'number',
  `totalItems ${r.json?.totalItems}`,
);
r = await call('GET', '/work-orders?title=MOTOR&status=pending&priority=high', { token: T });
ok(
  'filtros title (sin mayúsculas), status y priority',
  r.status === 200 && Array.isArray(r.json?.data),
);
r = await call('GET', '/work-orders?size=100&status=pending', { token: T });
ok(
  'listByStatus size=100',
  r.status === 200 && r.json?.size === 100 && r.json?.data.every((o) => o.status === 'pending'),
  `pending ${r.json?.totalItems}`,
);
r = await call('GET', '/work-orders?size=101', { token: T });
ok('size=101 → 400', r.status === 400, r.json?.code);

r = await call('POST', '/work-orders', {
  token: TL,
  body: {
    title: 'Orden spec018',
    description: 'Prueba de integración del frontend',
    type: 'correctivo',
    priority: 'high',
    machineRef: { machineId, partId: partB, comment: 'Hace ruido' },
  },
});
ok(
  'POST /work-orders (team leader, correctivo)',
  r.status === 201 &&
    r.json?.status === 'pending' &&
    r.json?.createdAt &&
    r.json?.machineRef?.breadcrumb?.includes('Motor'),
  r.json?.machineRef?.breadcrumb,
);
const orderId = r.json?.id;
r = await call('POST', '/work-orders', {
  token: TL,
  body: {
    title: 'Orden spec018',
    description: 'Prueba de integración del frontend',
    type: 'pronto-intervencion',
    priority: 'high',
    machineRef: { machineId, partId: null, comment: '' },
  },
});
ok('POST pronto-intervencion como team leader → 403', r.status === 403);
r = await call('POST', '/work-orders', {
  token: TL,
  body: {
    title: 'Orden spec018',
    description: 'Prueba de integración del frontend',
    type: 'correctivo',
    priority: 'high',
    machineRef: { machineId, partId: '1', comment: '' },
  },
});
ok(
  'POST con parte de otra máquina → 400 PART_OTHER_MACHINE',
  r.status === 400 && r.json?.code === 'PART_OTHER_MACHINE',
  r.json?.code,
);
r = await call('POST', '/work-orders', {
  token: TL,
  body: {
    title: 'x',
    description: 'corta',
    type: 'correctivo',
    priority: 'high',
    machineRef: { machineId, partId: null, comment: '' },
  },
});
ok(
  'POST inválido → 400 VALIDATION_ERROR con details por campo',
  r.status === 400 &&
    r.json?.code === 'VALIDATION_ERROR' &&
    r.json?.details &&
    typeof Object.values(r.json.details)[0] === 'string',
  JSON.stringify(r.json?.details),
);
r = await call('PUT', `/work-orders/${orderId}`, {
  token: TL,
  body: {
    title: 'Orden spec018 editada',
    description: 'Prueba de integración del frontend',
    priority: 'low',
  },
});
ok(
  'PUT /work-orders/{id} (título, descripción, prioridad)',
  r.status === 200 && r.json?.priority === 'low',
);
r = await call('PUT', `/work-orders/${orderId}`, {
  token: P,
  body: {
    title: 'Orden spec018 editada',
    description: 'Prueba de integración del frontend',
    priority: 'low',
  },
});
ok('PUT como producción → 403', r.status === 403);

// Tomar: el correctivo lo atiende el electricista (preventivo-correctivo); el técnico de guardia no
r = await call('POST', `/work-orders/${orderId}/take`, { token: T });
ok(
  'take por técnico de guardia (tipo que su equipo no atiende) → 403',
  r.status === 403,
  r.json?.code,
);
r = await call('POST', `/work-orders/${orderId}/take`, { token: E });
ok(
  'take por electricista',
  r.status === 200 &&
    r.json?.status === 'in-progress' &&
    r.json?.takenBy?.name &&
    r.json?.takenBy?.at,
  JSON.stringify(r.json?.takenBy),
);
r = await call('POST', `/work-orders/${orderId}/take`, { token: E });
ok(
  'take repetido → 409 WORK_ORDER_NOT_PENDING con details',
  r.status === 409 &&
    r.json?.code === 'WORK_ORDER_NOT_PENDING' &&
    r.json?.details?.status === 'in-progress' &&
    r.json?.details?.takenById &&
    r.json?.details?.takenByName,
  JSON.stringify(r.json?.details),
);
r = await call('POST', `/work-orders/${orderId}/close`, {
  token: E,
  body: { outcome: 'completed', comment: 'corto' },
});
ok('close con comentario corto → 400', r.status === 400, r.json?.code);
r = await call('POST', `/work-orders/${orderId}/release`, { token: A });
ok('release por admin', r.status === 200 && r.json?.status === 'pending' && !r.json?.takenBy);
r = await call('POST', `/work-orders/${orderId}/release`, { token: A });
ok(
  'release de una pendiente → 409 WORK_ORDER_NOT_IN_PROGRESS',
  r.status === 409 && r.json?.code === 'WORK_ORDER_NOT_IN_PROGRESS',
  JSON.stringify(r.json?.details),
);
await call('POST', `/work-orders/${orderId}/take`, { token: E });
r = await call('POST', `/work-orders/${orderId}/close`, {
  token: E,
  body: {
    outcome: 'completed',
    comment: 'Se reemplazó el motor de la cinta y se verificó el funcionamiento sin vibraciones.',
  },
});
ok(
  'close por el dueño',
  r.status === 200 &&
    r.json?.status === 'completed' &&
    r.json?.closingNote?.authorId &&
    r.json?.closingNote?.at,
  JSON.stringify(r.json?.closingNote?.authorName),
);
r = await call('POST', `/work-orders/${orderId}/release`, { token: A });
ok('release de una cerrada → 409', r.status === 409, JSON.stringify(r.json?.details));
r = await call('POST', `/work-orders/${orderId}/take`, { token: E });
ok(
  'take de una cerrada → 409 con details.status completed',
  r.status === 409 && r.json?.details?.status === 'completed',
);
r = await call('GET', `/work-orders/${orderId}`, { token: P });
ok('GET /work-orders/{id}', r.status === 200 && r.json?.closingNote);

// Dashboard
r = await call('GET', '/dashboard/summary', { token: T });
ok(
  'GET /dashboard/summary',
  r.status === 200 &&
    r.json?.byStatus &&
    r.json?.period?.from &&
    typeof r.json?.total === 'number' &&
    typeof r.json?.closedInPeriod?.total === 'number' &&
    'averageResolutionMinutes' in r.json,
  JSON.stringify({
    total: r.json?.total,
    open: r.json?.open,
    closed: r.json?.closedInPeriod,
    avg: r.json?.averageResolutionMinutes,
  }),
);
r = await call('GET', '/dashboard/workload', { token: TL });
ok(
  'GET /dashboard/workload (team leader)',
  r.status === 200 &&
    Array.isArray(r.json) &&
    (r.json.length === 0 ||
      (r.json[0].takenById && r.json[0].takenByName && typeof r.json[0].inProgress === 'number')),
  JSON.stringify(r.json?.slice?.(0, 2)),
);
r = await call('GET', '/dashboard/workload', { token: T });
ok('GET /dashboard/workload (técnico) → 403', r.status === 403);

// Limpieza
r = await call('DELETE', `/work-orders/${orderId}`, { token: A });
ok('DELETE /work-orders/{id} (admin)', r.status === 204);
await call('DELETE', `/parts/${partB}`, { token: TL });
await call('DELETE', `/parts/${partA}`, { token: TL });
r = await call('DELETE', `/machines/${machineId}`, { token: TL });
ok('limpieza: DELETE máquina sin partes', r.status === 204);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones OK`);
process.exit(failed.length ? 1 : 0);
