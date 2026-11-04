import { ref } from 'vue';
export const confirmation = ref<{ title: string; text: string; action: string } | null>(null);
let resolve: ((answer: boolean) => void) | null = null;
export function confirmAction(title: string, text: string, action = 'Xác nhận'): Promise<boolean> {
  if (resolve) resolve(false);
  confirmation.value = { title, text, action };
  return new Promise((done) => {
    resolve = done;
  });
}
export function answerConfirmation(answer: boolean) {
  resolve?.(answer);
  resolve = null;
  confirmation.value = null;
}
