// 路由注册与匹配：/api/sessions/:sid → ^/api/sessions/([^/]+)$
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function compile(path) {
  const names = [];
  const re = path.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : '\\' + m))
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    });
  return { re: new RegExp('^' + re + '$'), names };
}

export function createRouter() {
  const routes = [];
  const add = (method, defs) => {
    for (const d of defs) {
      const { re, names } = compile(d.path);
      routes.push({ method: method || d.method || 'GET', re, names, ...d });
    }
  };
  return {
    add,
    // 返回 { route, params } 或 null
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = {};
        r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
      return null;
    },
    get hasAnyMethod() { return routes.length; },
    methods: METHODS,
  };
}
