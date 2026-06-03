<template>
  <BaseDialog :trigger-class="triggerClass">
    <template #trigger><slot /></template>
    <template #title>{{ $t('client.setSecretKey') }}</template>
    <template #description>
      {{ $t('client.setSecretKeyDesc') }}
      <FormGroup>
        <FormTextField
          id="privateKey"
          v-model="privateKey"
          :label="$t('client.privateKey')"
        />
        <FormSecondaryActionField
          :label="$t('client.generateSecretKey')"
          type="button"
          @click="generateKey"
        />
      </FormGroup>
    </template>
    <template #actions>
      <DialogClose as-child>
        <BasePrimaryButton>{{ $t('dialog.cancel') }}</BasePrimaryButton>
      </DialogClose>
      <DialogClose as-child>
        <BaseSecondaryButton @click="$emit('set', privateKey)">
          {{ $t('client.setSecretKey') }}
        </BaseSecondaryButton>
      </DialogClose>
    </template>
  </BaseDialog>
</template>

<script lang="ts" setup>
defineEmits(['set']);
defineProps<{ triggerClass?: string; clientName: string }>();

const privateKey = ref('');

async function generateKey() {
  const data = await $fetch<{ privateKey: string }>('/api/client/generateSecretKey', {
    method: 'get',
  });
  privateKey.value = data.privateKey;
}
</script>
