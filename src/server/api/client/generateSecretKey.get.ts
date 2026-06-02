export default definePermissionEventHandler('clients', 'update', async () => {
  const preSharedKey = await wg.generatePreSharedKey();
  return { preSharedKey };
});
