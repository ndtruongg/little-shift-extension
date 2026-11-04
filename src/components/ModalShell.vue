<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';
import PixelIcon from './PixelIcon.vue';
const props = defineProps<{ open: boolean; title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open && !dialog.value?.open) dialog.value?.showModal();
    if (!open && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);
</script>
<template>
  <dialog
    ref="dialog"
    :class="['modal pixel-panel', { wide }]"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @click="
      (e) => {
        if (e.target === dialog) emit('close');
      }
    "
  >
    <header class="modal-heading">
      <h2 :id="titleId">{{ title }}</h2>
      <button class="icon-button" aria-label="Đóng cửa sổ" @click="emit('close')">
        <PixelIcon name="close" :size="18" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
