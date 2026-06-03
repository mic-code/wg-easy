export default definePermissionEventHandler('clients', 'update', async () => {
  const privateKey = await wg.generatePrivateKey();
  return { privateKey };
});
