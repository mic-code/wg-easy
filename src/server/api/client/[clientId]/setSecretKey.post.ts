import { ClientGetSchema } from '#db/repositories/client/types';
import z from 'zod';

const SetSecretKeySchema = z.object({
  preSharedKey: z
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
      { message: 'Pre-Shared Key must be a valid 32-byte base64-encoded key' }
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

    const { preSharedKey } = await readValidatedBody(
      event,
      validateZod(SetSecretKeySchema, event)
    );

    await Database.clients.setSecretKey(clientId, preSharedKey);
    await WireGuard.saveConfig();

    return { success: true };
  }
);