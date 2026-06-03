import { ClientGetSchema } from '#db/repositories/client/types';
import z from 'zod';

const SetSecretKeySchema = z.object({
  privateKey: z
    .string()
    .min(1)
    .refine(
      (val) => {
        try {
          const binary = atob(val);
          return binary.length === 32;
        } catch {
          return false;
        }
      },
      { message: 'Private Key must be a valid 32-byte base64-encoded key' }
    ),
});

export default definePermissionEventHandler(
  'clients',
  'update',
  async ({ event, checkPermissions }) => {
    const { clientId } = await getValidatedRouterParams(
      event,
      validateZod(ClientGetSchema, event)
    );

    const client = await Database.clients.get(clientId);
    checkPermissions(client);

    const { privateKey } = await readValidatedBody(
      event,
      validateZod(SetSecretKeySchema, event)
    );

    const publicKey = await wg.getPublicKey(privateKey);

    await Database.clients.setSecretKey(clientId, privateKey, publicKey);
    await WireGuard.saveConfig();

    return { success: true };
  }
);