<template>
  <BaseDialog :trigger-class="triggerClass">
    <template #trigger><slot /></template>
    <template #title>{{ $t('client.regenerateSecretKey') }}</template>
    <template #description>
      {{ $t('client.regenerateSecretKeyDialog1') }}
      <strong>{{ clientName }}</strong
      >? {{ $t('client.regenerateSecretKeyDialog2') }}
    </template>
    <template #actions>
      <DialogClose as-child>
        <BasePrimaryButton>{{ $t('dialog.cancel') }}</BasePrimaryButton>
      </DialogClose>
      <DialogClose as-child>
        <BaseSecondaryButton @click="$emit('regenerate')">
          {{ $t('client.regenerateSecretKey') }}
        </BaseSecondaryButton>
      </DialogClose>
    </template>
  </BaseDialog>
</template>

<script lang="ts" setup>
defineEmits(['regenerate']);
defineProps<{ triggerClass?: string; clientName: string }>();
</script>
