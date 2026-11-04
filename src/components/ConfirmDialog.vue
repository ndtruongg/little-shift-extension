<script setup lang="ts">
import ModalShell from './ModalShell.vue';
import { confirmation, answerConfirmation } from '../stores/confirm';
</script>
<template>
  <ModalShell
    :open="!!confirmation"
    :title="confirmation?.title ?? 'Xác nhận'"
    @close="answerConfirmation(false)"
  >
    <p class="dialog-copy">{{ confirmation?.text }}</p>
    <div class="dialog-actions">
      <button class="button secondary" @click="answerConfirmation(false)">Hủy</button
      ><button class="button primary" @click="answerConfirmation(true)">
        {{ confirmation?.action }}
      </button>
    </div>
  </ModalShell>
</template>
