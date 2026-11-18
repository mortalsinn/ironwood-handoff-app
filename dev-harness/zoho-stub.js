// Minimal stand-in for ZohoEmbededAppSDK so index.html boots outside Zoho CRM.
// Config via window.__ZSTUB (set before this script runs): { dealId, deal, users, onExecute }.
(function () {
  const cfg = window.__ZSTUB || {};
  const log = (window.__ZLOG = window.__ZLOG || []);
  const ok = (v) => Promise.resolve(v);
  const users = cfg.users || [
    { id: '1001', name: 'Thomas Reid', email: 'tom@example.test', zuid: '5001' },
    { id: '1002', name: 'Matthew De Man', email: 'matt@example.test', zuid: '5002' },
    { id: '1003', name: 'Joel Brandt', email: 'joel@example.test', zuid: '5003' },
    { id: '1004', name: 'Jeffery Chan', email: 'jeffery@example.test', zuid: '5004' },
    { id: '1005', name: 'Sam Sales', email: 'sam@example.test', zuid: '5005' }
  ];
  const deal = cfg.deal || { id: cfg.dealId || '9001', Deal_Name: 'Test Customer - RAIL - 12 Test St SW', Stage: 'Closed Won',
    Owner: { name: 'Sam Sales', email: 'sam@example.test' }, Account_Name: { name: 'Test Customer' } };
  let pageLoad = null;
  window.ZOHO = {
    embeddedApp: {
      on: (ev, fn) => { if (ev === 'PageLoad') pageLoad = fn; },
      init: () => { setTimeout(() => pageLoad && pageLoad({ Entity: 'Deals', EntityId: [cfg.dealId || deal.id] }), 10); return ok(); }
    },
    CRM: {
      CONNECTION: { invoke: (name, req) => { log.push(['invoke', req.url]);
        if (/\/users\//.test(req.url)) return ok({ details: { statusMessage: JSON.stringify({ users: users }) } });
        if (/\/tags/.test(req.url)) return ok({ details: { statusMessage: JSON.stringify({ tags: [], page_info: { has_next_page: false } }) } });
        return ok({ details: { statusMessage: '{}' } }); } },
      API: {
        getRecord: (o) => ok({ data: [deal] }),
        getAllRecords: () => ok({ data: [] }),
        searchRecord: () => ok({ data: [] }),
        getRelatedRecords: () => ok({ data: [] }),
        insertRecord: (o) => { log.push(['insert', o]); return ok({ data: [{ code: 'SUCCESS', details: { id: 'n1' } }] }); },
        updateRecord: (o) => { log.push(['update', o]); return ok({ data: [{ code: 'SUCCESS' }] }); },
        deleteRecord: () => ok({ data: [{ code: 'SUCCESS' }] }),
        getAllUsers: () => ok({ users: users.map(u => ({ id: u.id, full_name: u.name, email: u.email })) }),
        getOrgVariable: () => ok({ Success: { Content: '' } })
      },
      CONFIG: { getCurrentUser: () => ok({ users: [{ full_name: 'Sam Sales' }] }) },
      FUNCTIONS: { execute: (name, req) => {
        log.push(['execute', name, req]);
        if (name === 'create_handoff_tasks') { window.__LAST_PAYLOAD = JSON.parse(JSON.parse(req.arguments).payload);
          return ok({ code: 'success', details: { output: 'Success: stub created 0 tasks' } }); }
        return ok({ code: 'success', details: { output: '' } }); } },
      UI: { Resize: () => ok(), Popup: { close: () => ok(), closeReload: () => ok() } }
    }
  };
})();
