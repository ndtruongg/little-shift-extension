<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 24 });
const shapes: Record<string, string> = {
  star: 'M10 1h4v5h4v3h5v4h-4v4h2v5h-5v-3H8v3H3v-5h2v-4H1V9h5V6h4z',
  tomato: 'M10 1h4v4h4v3h3v11h-3v3H6v-3H3V8h3V5h4zm0 5H7v3h3v3h4V9h3V6h-4V3h-2z',
  tasks: 'M5 2h14v2h2v17H5v2H2V5h3zm3 5v2h8V7zm0 5v2h8v-2zm0 5v2h5v-2z',
  gear: 'M9 1h6v4h4v4h4v6h-4v4h-4v4H9v-4H5v-4H1V9h4V5h4zm0 8v6h6V9z',
  calendar: 'M5 1h3v4h8V1h3v4h4v18H1V5h4zm-1 9v10h16V10zm3 2h3v3H7zm7 0h3v3h-3z',
  play: 'M6 3h3v2h3v2h3v2h3v2h3v2h-3v2h-3v2h-3v2H9v2H6z',
  pause: 'M5 3h5v18H5zm9 0h5v18h-5z',
  reset: 'M7 2h10v3h3v3h3v5h-9V9h4V7h-3V5H9v2H6v10h3v2h7v-2h4v4h-3v2H7v-3H4v-3H1V8h3V5h3z',
  plus: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  check: 'M1 11h4v4h3v3h3v-3h3v-3h3V9h3V5h4v7h-3v3h-3v3h-3v3H7v-3H4v-3H1z',
  close: 'M3 2h3v3h3v3h6V5h3V2h3v4h-3v3h-3v6h3v3h3v4h-3v-3h-3v-3H9v3H6v3H3v-4h3v-3h3V9H6V6H3z',
  music: 'M9 3h13v14h-3v3h-6v-6h6V7h-7v13H9v3H3v-3H1v-3h3v-3h5z',
  rain: 'M8 2h8v3h4v3h3v7H1V8h3V5h4zm-4 16h3v3H4zm7-1h3v5h-3zm7 1h3v3h-3z',
  cafe: 'M3 8h14v2h6v8h-6v3H3zm14 5v2h3v-2zM1 22h20v2H1zM6 1h2v5H6zm6 2h2v3h-2z',
  forest: 'M10 1h4v3h3v4h3v4h3v3h-5v4h-4v4h-4v-4H6v-4H1v-3h3V8h3V4h3z',
  sound: 'M1 9h5V6h3V3h4v18H9v-3H6v-3H1zm15-4h3v3h3v8h-3v3h-3v-3h3V8h-3z',
  mute: 'M1 9h5V6h3V3h4v18H9v-3H6v-3H1zm15 0h3v3h3v3h-3v-3h-3z',
  flag: 'M3 1h3v2h16v6h-5v6H6v8H3z',
  clock: 'M9 1h6v3h4v3h3v12h-3v3H5v-3H2V7h3V4h4zm1 6v7h7v-3h-4V7z',
  layers:
    'M10 1h4v2h4v2h4v4h-4v2h-4v2h-4v-2H6V9H2V5h4V3h4zM2 12h4v2h4v2h4v-2h4v-2h4v4h-4v2h-4v2h-4v-2H6v-2H2zm0 7h4v2h4v2h4v-2h4v-2h4v3h-4v2H6v-2H2z',
  laptop: 'M3 2h18v17h3v3H0v-3h3zm3 3v12h12V5z',
  bell: 'M10 1h4v3h4v4h3v9h3v3H0v-3h3V8h3V4h4zm0 21h4v2h-4z',
  edit: 'M16 1h4v3h3v4h-3v3h-3v3h-3v3h-3v3H2v-9h3V8h3V5h3V2h3zm-11 12v5h5v-2H8v-3z',
  trash: 'M8 1h8v3h6v3H2V4h6zm-4 8h16v13H4zm4 2v8h2v-8zm6 0v8h2v-8z',
  up: 'M10 5h4v3h3v3h3v3h3v3h-6v-3h-3v-3h-4v3H7v3H1v-3h3v-3h3V8h3z',
  down: 'M1 7h6v3h3v3h4v-3h3V7h6v3h-3v3h-3v3h-3v3h-4v-3H7v-3H4v-3H1z',
  moon: 'M10 1h6v3h-4v3H9v7h3v3h7v-3h4v6h-4v3H7v-3H3v-4H1V8h3V4h6z',
  download: 'M10 1h4v11h4v-3h4v6h-4v3h-4v3h-4v-3H6v-3H2V9h4v3h4zM1 21h22v3H1z',
  upload: 'M10 1h4v3h4v3h4v6h-4v-3h-4v11h-4V10H6v3H2V7h4V4h4zM1 22h22v2H1z',
  arrow: 'M13 2h4v3h3v3h3v8h-3v3h-3v3h-4v-5h3v-3H1v-4h15V7h-3z',
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    shape-rendering="crispEdges"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="shapes[name] || shapes.star" />
  </svg>
</template>
