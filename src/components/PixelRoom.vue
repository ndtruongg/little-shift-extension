<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAppStore } from '../stores/app';
import PixelIcon from './PixelIcon.vue';
const app = useAppStore();
const scene = computed(() =>
  app.state.settings.ambient === 'off' ? 'rain' : app.state.settings.ambient,
);
const palettes = {
  rain: {
    label: 'Mưa đêm',
    view: 'đêm mưa',
    wall: ['#383348', '#524052'],
    sky: ['#101d3d', '#294974'],
    floor: ['#76514b', '#b27854'],
  },
  cafe: {
    label: 'Quán cà phê',
    view: 'quán cà phê ánh vàng',
    wall: ['#4b3540', '#755044'],
    sky: ['#ae776f', '#e2b17d'],
    floor: ['#855541', '#c69260'],
  },
  forest: {
    label: 'Rừng xanh',
    view: 'nhìn ra rừng xanh và sương sớm',
    wall: ['#2b3b3b', '#4d604a'],
    sky: ['#bccba7', '#668d78'],
    floor: ['#525846', '#9b885b'],
  },
} as const;
const palette = computed(() => palettes[scene.value]);
const roomTitle = computed(() =>
  app.state.settings.ambient === 'off' ? 'Góc nhỏ của riêng bạn' : palette.value.label,
);
const visible = ref(!document.hidden);
const onVisibility = () => {
  visible.value = !document.hidden;
};
onMounted(() => document.addEventListener('visibilitychange', onVisibility));
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility));
const animate = computed(() => app.state.settings.animation && visible.value);
const typing = computed(
  () => animate.value && app.state.timer.mode === 'focus' && app.state.timer.status === 'running',
);
const leaves = Array.from({ length: 68 }, (_, i) => ({
  x: 100 + ((i * 47) % 110),
  y: 8 + ((i * 29) % 83),
  color: ['#42664a', '#63824e', '#9caa57', '#758e4d'][i % 4],
}));
const trailing = Array.from({ length: 32 }, (_, i) => ({
  x: 133 + (i % 3) * 15 + ((i * 7) % 12),
  y: 67 + i * 6,
  color: ['#688d4a', '#9aab55', '#416342'][i % 3],
}));
const books = Array.from({ length: 42 }, (_, i) => ({
  x: 8 + (i % 14) * 10,
  y: 83 + Math.floor(i / 14) * 78,
  height: 36 + ((i * 7) % 20),
  color: ['#aa704e', '#656584', '#a08a65', '#6e514d', '#7b8d88', '#4b5971', '#b3986b'][i % 7],
}));
const rain = Array.from({ length: 55 }, (_, i) => ({
  x: 302 + ((i * 37) % 338),
  y: -80 + ((i * 47) % 330),
  delay: -i * 0.13,
  duration: 1.1 + (i % 4) * 0.23,
}));
const buildings = [
  { x: 312, y: 165, w: 35 },
  { x: 349, y: 132, w: 41 },
  { x: 393, y: 172, w: 45 },
  { x: 439, y: 146, w: 39 },
  { x: 480, y: 112, w: 42 },
  { x: 526, y: 147, w: 39 },
  { x: 571, y: 92, w: 47 },
  { x: 619, y: 145, w: 29 },
];
const forestTrees = Array.from({ length: 13 }, (_, i) => ({
  x: 306 + i * 28,
  y: 40 + ((i * 31) % 65),
  scale: 0.65 + (i % 3) * 0.2,
  color: ['#31564c', '#406950', '#527b55'][i % 3],
}));
const floorMarks = Array.from({ length: 80 }, (_, i) => ({
  x: (i * 71) % 640,
  y: 346 + ((i * 31) % 94),
  w: 8 + ((i * 7) % 39),
}));
</script>
<template>
  <div
    :data-scene="scene"
    :class="[
      'pixel-room',
      { animated: animate, typing, resting: app.state.timer.mode !== 'focus' },
    ]"
  >
    <svg
      viewBox="0 0 640 440"
      xmlns="http://www.w3.org/2000/svg"
      shape-rendering="crispEdges"
      role="img"
      :aria-label="`Căn phòng pixel ${palette.view}: một bạn đeo tai nghe làm việc bên đèn vàng, cây xanh và mèo đang ngủ.`"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="wall" x2="1" y2="1">
          <stop :stop-color="palette.wall[0]" />
          <stop offset="1" :stop-color="palette.wall[1]" />
        </linearGradient>
        <linearGradient id="night" x2="0" y2="1">
          <stop :stop-color="palette.sky[0]" />
          <stop offset="1" :stop-color="palette.sky[1]" />
        </linearGradient>
        <linearGradient id="floor" x2="0" y2="1">
          <stop :stop-color="palette.floor[0]" />
          <stop offset="1" :stop-color="palette.floor[1]" />
        </linearGradient>
        <radialGradient id="warmglow">
          <stop stop-color="#ffc769" stop-opacity=".28" />
          <stop offset="1" stop-color="#ffc769" stop-opacity="0" />
        </radialGradient>
        <clipPath id="window-clip"><path d="M300 5h332v257H300z" /></clipPath>
      </defs>
      <!-- Room architecture -->
      <path d="M0 0h640v440H0z" fill="url(#wall)" />
      <path d="M165 0h7v339h-7zM277 0h9v344h-9z" fill="#231f32" />
      <path d="M174 0h3v337h-3zM286 0h4v340h-4z" fill="#765452" />
      <path d="M1 334h639v106H0z" fill="url(#floor)" />
      <path
        d="M0 339h640v5H0zm0 20h640v3H0zm0 24h640v3H0zm0 27h640v4H0zm70-66h3v15h-3zm151 0h3v15h-3zm184 0h3v15h-3zm131 0h3v15h-3zM8 362h3v21H8zm141 0h3v21h-3zm173 0h3v21h-3zm188 0h3v21h-3zM69 386h3v24h-3zm174 0h3v24h-3zm195 0h3v24h-3zM133 414h3v26h-3zm184 0h3v26h-3zm231 0h3v26h-3z"
        fill="#4a3540"
      />
      <path
        v-for="(mark, i) in floorMarks"
        :key="`floor${i}`"
        :d="`M${mark.x} ${mark.y}h${mark.w}v1h-${mark.w}z`"
        fill="#d89560"
        opacity=".26"
      />
      <!-- The window landscape follows the selected sound; the room stays shared. -->
      <path d="M292 0h348v276H292z" fill="#171c30" />
      <path d="M300 5h332v257H300z" fill="url(#night)" />
      <g clip-path="url(#window-clip)">
        <g v-if="scene === 'forest'" data-landscape="forest">
          <path d="M552 26h22v5h6v18h-6v5h-22v-5h-6V31h6z" fill="#f1dfa4" opacity=".8" />
          <path
            d="M300 155h22v-16h25v-23h24v-19h30v17h25v22h34v-29h30V91h32v25h29v24h27v-19h31v-15h31v158H300z"
            fill="#8aa78c"
          />
          <path
            d="M300 195h28v-17h31v-21h30v19h34v-27h32v-17h25v28h31v-13h34v24h29v-18h32v-14h34v125H300z"
            fill="#60846a"
          />
          <g
            v-for="(tree, i) in forestTrees"
            :key="`tree${i}`"
            :transform="`translate(${tree.x} ${tree.y}) scale(${tree.scale})`"
          >
            <path d="M-3 90h6v92h-6z" fill="#324e40" />
            <path
              d="M-4 0h8v12h8v12h8v12h12v14H-32V36h12V24h8V12h8zM-12 40h24v16h12v14h12v16H-36V70h12V56h12zM-20 78h40v14h12v14h12v18H-44v-18h12V92h12z"
              :fill="tree.color"
            />
            <path
              d="M-4 15h4v18h-8v12h-12v-6h8V27h8zM-12 58h5v17h-15v-6h10zM-20 95h5v17h-16v-6h11z"
              fill="#aac38a"
              opacity=".3"
            />
          </g>
          <path
            d="M300 139h105v4H300zm96 29h236v5H396zm-96 53h198v5H300zm163 21h169v4H463z"
            fill="#d9e5bd"
            opacity=".22"
          />
          <path
            d="M300 252h21v-8h26v5h31v-9h32v8h41v-11h24v7h39v-8h31v10h29v-12h25v8h33v22H300z"
            fill="#315a47"
          />
        </g>
        <g v-else>
          <path
            d="M554 22h15v3h6v14h-6v5h-15v-4h-5V27h5z"
            :fill="scene === 'cafe' ? '#ffe2a2' : '#acbec1'"
            :opacity="scene === 'cafe' ? 0.8 : 0.35"
          />
          <g v-for="(b, i) in buildings" :key="`building${i}`">
            <path
              :d="`M${b.x} ${b.y}h${b.w}v140h-${b.w}z`"
              :fill="
                scene === 'cafe' ? (i % 2 ? '#72535a' : '#8f6864') : i % 2 ? '#15233f' : '#1c3151'
              "
            />
            <path
              :d="`M${b.x + 8} ${b.y + 11}h4v8h-4zm12 0h4v8h-4zm-12 19h4v8h-4zm12 19h4v8h-4zm-12 20h4v8h-4z`"
              :fill="scene === 'cafe' ? '#ffdc9a' : i % 2 ? '#d6b86c' : '#7195b6'"
              opacity=".8"
            />
          </g>
        </g>
        <g v-if="scene === 'cafe'" data-landscape="cafe">
          <path d="M300 154h332v110H300z" fill="#9b6b50" />
          <path d="M315 164h308v100H315z" fill="#67483e" />
          <path d="M325 172h92v87h-92zm109 0h57v87h-57zm74 0h104v87H508z" fill="#36353b" />
          <path d="M332 179h78v63h-78zm109 0h43v63h-43zm74 0h90v63h-90z" fill="#d5aa70" />
          <path
            d="M336 182h70v3h-70zm183 0h82v3h-82zM365 177h5v67h-5zm193 0h5v67h-5z"
            fill="#f7d395"
          />
          <path d="M447 187h31v42h-31z" fill="#35413b" />
          <path d="M452 194h21v2h-21zm0 7h16v2h-16zm0 7h19v2h-19zm0 7h14v2h-14z" fill="#d8d5b2" />
          <path d="M427 80h85v35h-85z" fill="#68463b" />
          <path d="M431 84h77v27h-77z" fill="#313e3e" />
          <path
            d="M449 92h28v15h-24v-4h-4zm28 1h8v10h-8v-3h4v-4h-4zM445 108h38v3h-38z"
            fill="#f1d29a"
          />
          <path d="M458 88v-5h3v-5m6 10v-7h3v-5" fill="none" stroke="#f1d29a" stroke-width="2" />
          <path d="M300 122h332v8H300z" fill="#4c3a3b" />
          <path
            v-for="n in 9"
            :key="`awning${n}`"
            :d="`M${300 + (n - 1) * 40} 130h40v24h-5v5h-30v-5h-5z`"
            :fill="n % 2 ? '#e8cf9d' : '#ad674c'"
          />
          <path
            d="M300 38h50v6h65v5h70v-5h70v-6h77"
            fill="none"
            stroke="#59433e"
            stroke-width="2"
          />
          <g v-for="n in 7" :key="`light${n}`">
            <path
              :d="`M${310 + n * 40} ${n < 3 || n > 5 ? 43 : 49}v10`"
              stroke="#59433e"
              stroke-width="2"
            />
            <path :d="`M${307 + n * 40} ${n < 3 || n > 5 ? 51 : 57}h6v7h-6z`" fill="#ffe4a3" />
          </g>
        </g>
        <path
          d="M303 0v245m28-245v245m52-245v245m49-245v245m40-245v245m49-245v245m50-245v245m42-245v245"
          stroke="#6b8ba7"
          stroke-width="1"
          opacity=".13"
        />
        <g v-if="scene === 'rain'" class="rain-layer" data-landscape="rain">
          <path
            v-for="(drop, i) in rain"
            :key="`rain${i}`"
            class="rain-drop"
            :d="`M${drop.x} ${drop.y}v8h-2v6`"
            fill="none"
            stroke="#94b8d6"
            :stroke-width="i % 3 === 0 ? 2 : 1"
            :opacity="0.25 + (i % 3) * 0.14"
            :style="{ animationDelay: `${drop.delay}s`, animationDuration: `${drop.duration}s` }"
          />
        </g>
        <path
          d="M300 0h9v260h-9zm110 0h10v260h-10zm112 0h10v260h-10zM300 102h340v10H300zm0 149h340v12H300z"
          fill="#191e31"
        />
        <path
          d="M310 0h2v260h-2zm110 0h2v260h-2zm112 0h2v260h-2zM300 112h340v2H300z"
          fill="#5b5263"
        />
        <!-- Ivy silhouettes in upper corner -->
        <path
          d="M300 0h55v10h-12v10h-13v12h-16v17h-13zm339 0h-28v14h-11v18h14v12h26z"
          fill="#142b38"
        />
        <path d="M320 12h15v11h-15zm-15 26h14v11h-14zm300-15h14v13h-14z" fill="#263d44" />
      </g>
      <path d="M291 264h349v8H291z" fill="#77605b" />
      <path d="M292 272h348v5H292z" fill="#211e30" />
      <!-- Shelving -->
      <path d="M0 38h160v301H0z" fill="#241f31" />
      <path d="M4 42h149v292H4z" fill="#49353c" />
      <path
        d="M0 44h156v7H0zm0 76h156v10H0zm0 80h156v10H0zm0 79h156v10H0zm0 53h156v11H0z"
        fill="#a66e4c"
      />
      <path d="M0 53h150v4H0zm0 77h150v4H0zm0 80h150v4H0zm0 79h150v4H0z" fill="#342735" />
      <path d="M151 39h9v301h-9z" fill="#211d2c" />
      <path d="M147 42h4v296h-4z" fill="#c28a59" />
      <g v-for="(book, i) in books" :key="`book${i}`">
        <path
          :d="`M${book.x} ${book.y - book.height + 37}h7v${book.height}h-7z`"
          :fill="book.color"
        />
        <path
          :d="`M${book.x + 2} ${book.y - book.height + 44}h3v2h-3zm0 18h3v1h-3z`"
          fill="#e5c39a"
          opacity=".45"
        />
      </g>
      <path d="M15 20h23v20H15z" fill="#9b7462" />
      <path d="M20 23h2v9h-2zm8 2h5v3h-5z" fill="#60484b" />
      <path d="M44 19h27v21H44z" fill="#80665f" />
      <path d="M48 21h2v13h-2z" fill="#b68a64" />
      <!-- Shelf star light -->
      <circle cx="85" cy="103" r="39" fill="url(#warmglow)" />
      <path d="M81 77h8v10h8v6h10v7H97v8h3v9H89v-6H80v6H69v-9h4v-8H63v-7h10v-6h8z" fill="#dc9845" />
      <path d="M82 82h6v10h10v7H89v10h-7v-10H72v-7h10z" fill="#ffe999" />
      <path d="M78 98h3v4h-3zm11 0h3v4h-3z" fill="#9b6344" />
      <!-- Hanging plant -->
      <path d="M148 39h42v21h-6v12h-30V60h-6z" fill="#9e684e" />
      <path d="M148 39h42v6h-42z" fill="#d3915d" />
      <path
        d="M158 3v32m19-28v32m-8-30v30m-14 23v156m18-150v172m19-169v114"
        stroke="#384c36"
        stroke-width="4"
      />
      <g v-for="(leaf, i) in leaves" :key="`leaf${i}`">
        <path :d="`M${leaf.x} ${leaf.y}h9v3h5v7h-4v6h-8v-5h-5v-7h3z`" :fill="leaf.color" />
        <path :d="`M${leaf.x + 2} ${leaf.y + 4}h3v7h-3z`" fill="#c3bc64" opacity=".35" />
      </g>
      <g v-for="(leaf, i) in trailing" :key="`trailing${i}`">
        <path :d="`M${leaf.x} ${leaf.y}h7v4h4v7h-4v6h-7v-4h-4v-8h4z`" :fill="leaf.color" />
      </g>
      <!-- Wall picture, notes and clock -->
      <path d="M216 64h54v80h-54z" fill="#241f30" />
      <path d="M220 68h46v72h-46z" fill="#ba8355" />
      <path d="M224 72h38v64h-38z" fill="#24314b" />
      <path d="M224 121h7v-8h7v-12h6v8h5v9h7v6h6v12h-38z" fill="#6c6e8e" />
      <path d="M237 111h13v6h-4v-6h-3v4h-6z" fill="#c5c2b1" />
      <path
        d="M248 80h8v3h-5v6h5v3h-8v-3h-3v-6h3zM230 86h2v3h3v2h-3v3h-2v-3h-3v-2h3z"
        fill="#f1ce81"
      />
      <path d="M194 169h23v31h-23zM226 156h21v23h-21z" fill="#c39b71" />
      <path d="M198 178h14v2h-14zm0 6h11v2h-11zm32-21h13v2h-13z" fill="#785a52" />
      <path d="M204 166h4v7h-4zm30-13h4v6h-4z" fill="#3a3043" />
      <!-- Warm lamp pool -->
      <ellipse class="lamp-glow" cx="464" cy="245" rx="151" ry="135" fill="url(#warmglow)" />
      <!-- Desk and drawers -->
      <path d="M237 280h353v13H237z" fill="#2c2331" />
      <path d="M234 276h361v10H234z" fill="#be8151" />
      <path d="M239 277h349v3H239z" fill="#edb675" />
      <path d="M253 292h13v71h-13zm310 0h14v72h-14z" fill="#4d3637" />
      <path d="M256 292h4v66h-4zm310 0h4v66h-4z" fill="#91614a" />
      <path d="M427 293h73v70h-73z" fill="#3a2a35" />
      <path d="M433 296h60v27h-60zm0 32h60v29h-60z" fill="#936b54" />
      <path d="M434 299h58v3h-58zm0 32h58v3h-58z" fill="#bc8c65" />
      <path d="M454 306h20v4h-20zm0 34h20v4h-20z" fill="#342b36" />
      <!-- Computer -->
      <path d="M353 192h105v74H349v-66h4z" fill="#161b2d" />
      <path d="M356 197h95v62h-95z" fill="#62647d" />
      <path class="screen-glow" d="M361 201h86v52h-86z" fill="#1c2a46" />
      <path d="M363 204h82v3h-82z" fill="#738097" />
      <path
        d="M366 211h8v3h-8zm0 8h17v3h-17zm0 8h12v3h-12zm0 8h22v3h-22zm0 8h8v3h-8z"
        fill="#658ba5"
      />
      <path d="M379 211h37v3h-37zm9 8h45v3h-45zm-3 8h32v3h-32zm9 8h42v3h-42z" fill="#d9ab66" />
      <path d="M381 243h29v3h-29zm40-16h17v3h-17z" fill="#8ca285" />
      <path d="M394 264h14v9h19v4h-50v-4h17zM333 271h50v5h-50z" fill="#242638" />
      <path d="M335 271h44v2h-44z" fill="#72758b" />
      <!-- Anglepoise lamp -->
      <path d="M532 270h40v6h-40zM549 267v-45h6v45z" fill="#292633" />
      <path d="M549 225l-32-51 6-4 34 53z" fill="#1c2231" />
      <path d="M547 222l-29-48 2-1 31 48z" fill="#a17b54" />
      <path d="M518 176l-44-29 4-5 45 28z" fill="#262531" />
      <path d="M520 171l-43-27 1-2 43 27z" fill="#bc925c" />
      <path d="M512 167h13v14h-13zM545 216h14v14h-14z" fill="#171e2d" />
      <path d="M516 171h5v5h-5zm33 49h6v6h-6z" fill="#9f7d55" />
      <path d="M463 128h12v17h-12z" fill="#6d4b3e" />
      <path d="M452 142h30v10h7v11h-43v-11h6z" fill="#ae7949" />
      <path d="M446 163h43v6h-43z" fill="#ffce70" />
      <path d="M452 166h30v6h-30z" fill="#ffe5a0" />
      <!-- Desk objects -->
      <path d="M462 257h21v20h-21zM483 261h9v11h-9z" fill="#ffd47a" />
      <path d="M466 260h14v15h-14zM486 264h3v5h-3z" fill="#475575" />
      <path d="M470 264h6v6h-6z" fill="#ffdc8a" />
      <path
        class="steam"
        d="M468 250v-5h3v-7m6 14v-8h3v-7"
        fill="none"
        stroke="#e9cd9a"
        stroke-width="2"
        opacity=".6"
      />
      <path d="M505 255h17v21h-17z" fill="#bf9858" />
      <path d="M509 255v-19h3v19m4 0v-24h2v24" stroke="#efd190" stroke-width="3" />
      <path d="M536 261h42v7h-42z" fill="#846280" />
      <path d="M534 269h46v7h-46z" fill="#d4a76c" />
      <path d="M540 263h35v3h-35z" fill="#d9b693" />
      <!-- Character silhouette and chair -->
      <path d="M221 260h-27v-20h8v-8h38v9h9v74h-11v13h-36v-9h-9v-49h28z" fill="#151e31" />
      <path d="M199 242h31v13h9v60h-37v-9h-3z" fill="#344361" />
      <path d="M200 243h29v4h-29z" fill="#5a6380" />
      <path
        d="M215 321h67v12h-67zM239 332h9v32h-9zm-26 30h62v5h-62zm-6 5h11v7h-11zm63 0h11v7h-11z"
        fill="#1a2031"
      />
      <path d="M252 297h35v27h14v24h12v13h-29v-8h-8v-29h-26z" fill="#252b46" />
      <path d="M284 351h26v8h12v7h-39z" fill="#c99a71" />
      <path d="M237 221h32v6h18v13h9v44h-10v19h-52v-12h-6v-53h9z" fill="#3b2933" />
      <path d="M239 228h30v9h12v21h8v25h-10v15h-39v-13h-6v-46h5z" fill="#a55e43" />
      <path d="M240 234h7v47h27v11h-34z" fill="#7c473d" />
      <path d="M261 215h20v18h-20z" fill="#cf9467" />
      <path d="M265 217h16v9h-16z" fill="#e9b77e" />
      <!-- Face -->
      <path d="M239 160h39v10h13v12h7v28h-9v11h-17v-6h-20v-14h-13z" fill="#e2a673" />
      <path d="M272 176h16v18h6v11h-11v11h-12v-13h-9v-22h10z" fill="#f2c18c" />
      <path d="M284 182h4v8h-4zm9 14h7v4h-7z" fill="#503337" />
      <!-- Stepped hair -->
      <path
        d="M230 157h10v-10h18v-7h18v6h16v10h9v11h-7v10h-13v-8h-9v16h-12v15h-12v15h-13v-9h-9v-13h-9v-24h7v-12z"
        fill="#171c2c"
      />
      <path d="M230 163h9v-9h19v-6h16v6h15v7h-24v9h-13v11h-18v17h-8v-26h4z" fill="#2c2b40" />
      <path d="M241 155h8v-6h12v-4h6v6h-10v6h-16zm-14 25h7v5h-7z" fill="#3b3548" />
      <!-- Headphones -->
      <path d="M249 149h9v-8h16v7h-13v22h-10v30h-8v-36h6z" fill="#75819e" />
      <path d="M254 145h4v21h-4z" fill="#b1acb3" />
      <path d="M240 180h24v6h6v22h-6v7h-24v-6h-6v-23h6z" fill="#101b2e" />
      <path d="M242 185h18v5h5v14h-5v6h-18v-5h-4v-15h4z" fill="#d2a262" />
      <path d="M245 189h13v16h-13z" fill="#354761" />
      <path d="M249 191h5v4h4v4h-4v4h-5v-4h-4v-4h4z" fill="#f4cd7d" />
      <!-- Animated typing arm -->
      <g class="typing-arm">
        <path d="M273 251h15v11h14v5h30v-7h14v5h9v11h-48v-3h-21v-6h-13z" fill="#613d37" />
        <path d="M278 253h8v13h17v4h28v-8h14v4h7v7h-46v-3h-20v-4h-8z" fill="#c57a4b" />
        <path d="M330 262h15v4h7v7h-21z" fill="#eab17a" />
        <path d="M340 264h3v6h-3zm6 3h3v4h-3z" fill="#a96849" />
      </g>
      <!-- Large floor plant -->
      <path
        d="M610 309v-103m5 88l-31-40m27 18l25-37m-25 8l-28-30m30 9l18-34"
        fill="none"
        stroke="#334d3c"
        stroke-width="5"
      />
      <path
        d="M605 216h-14v-5h-13v-10h-7v-11h16v4h13v10h5zm12 21v-15h8v-11h15v19h-10v7zm-13 28h-12v-6h-17v-11h-5v-10h15v5h13v9h6zm11 21v-15h10v-10h15v17h-11v8zm-4-72v-20h6v-14h15v18h-9v16z"
        fill="#71864c"
      />
      <path
        d="M580 196h11v6h9v8h-6v-5h-14zm46 20h8v7h-8zm-48 29h12v6h7v7h-8v-6h-11zm46 26h14v6h-14z"
        fill="#a5aa61"
      />
      <path d="M589 306h45v8h-4v39h-6v10h-26v-10h-5v-39h-4z" fill="#553c3d" />
      <path d="M594 309h35v5h-35zm4 8h26v33h-5v8h-16v-8h-5z" fill="#bc7f51" />
      <path d="M600 321h5v29h-5z" fill="#e5a460" />
      <!-- Books by the desk -->
      <path
        d="M514 319h7v43h-7zM524 326h9v36h-9zM536 315h10v47h-10zM550 321h8v41h-8z"
        fill="#545573"
      />
      <path d="M516 327h3v3h-3zm11 5h4v3h-4zm12-9h4v3h-4zm13 6h4v3h-4z" fill="#c4ab7d" />
      <!-- Rug -->
      <path d="M203 365h301l-38 65H150z" fill="#302c43" />
      <path d="M207 369h288l-32 54H162z" fill="#7f6672" />
      <path d="M212 374h273l-27 43H175z" fill="#37425d" />
      <path d="M218 379h255l-21 33H188z" fill="none" stroke="#bb8d63" stroke-width="2" />
      <path
        d="M224 390h6v3h-6zm26 10h8v3h-8zm28-12h6v3h-6zm20 15h8v3h-8zm30-14h7v3h-7zm27 10h7v3h-7zm22-12h7v3h-7zm21 14h8v3h-8zm27-12h8v3h-8z"
        fill="#bc945f"
      />
      <!-- Sleeping cat and cushion -->
      <path d="M22 369h119v28H18v-21h4z" fill="#1d263b" />
      <path d="M26 367h108v8h8v13H22v-13h4z" fill="#535e7a" />
      <path
        d="M26 371h107v4H26zM41 375v12m28-12v12m35-12v12m22-12v12"
        stroke="#73809a"
        stroke-width="2"
      />
      <g class="sleeping-cat">
        <path d="M34 353v-12h9v-9h14v-6h29v5h14v9h9v16h-8v12H45v-7H34z" fill="#643b36" />
        <path d="M40 345h8v-9h13v-5h23v6h14v8h7v11h-9v8H48v-7h-8z" fill="#cd8953" />
        <path d="M48 339h8v10h-6v11h-6v-14h4zm15-7h7v12h-7zm17 2h7v14h-7z" fill="#a25d3d" />
        <path d="M83 344v-12h7v5h8v4h12v-6h8v17h4v10h-8v7H89v-5h-9v-14h3z" fill="#e2a568" />
        <path d="M88 338h3v6h-3zm24 2h3v6h-3z" fill="#b76c4c" />
        <path d="M91 357h6v2h-6zm17 0h6v2h-6zm-6 4h3v3h-3z" fill="#603d3d" />
        <path d="M92 363h7v5h-7zm15 0h7v5h-7z" fill="#f0d0a0" />
        <path d="M59 355h14v5H61v6h18v5H54v-5h-5v-7h10z" fill="#e8aa69" />
      </g>
      <g class="cat-z" fill="#f0d9a4">
        <path
          d="M117 322h8v2h-3v3h-3v2h6v2h-9v-2h3v-3h3v-2h-5zm13-16h9v2h-3v3h-3v2h6v2h-9v-2h3v-3h3v-2h-6z"
        />
      </g>
      <!-- Tiny room details -->
      <path d="M6 320h28v17H6z" fill="#786258" />
      <path d="M11 314h18v7H11z" fill="#405944" />
      <path d="M15 306h7v12h-7zm-8 1h8v6H7zm15-6h8v7h-8z" fill="#82934f" />
      <path d="M0 0h640v440H0z" fill="none" stroke="#111b2e" stroke-width="6" />
    </svg>
    <div class="room-label">
      <span class="live-dot" />{{
        app.state.timer.status === 'running' && app.state.timer.mode === 'focus'
          ? 'Một chút tập trung, một chút tiến bộ'
          : app.state.timer.mode !== 'focus'
            ? 'Thả lỏng vai, nghỉ ngơi một chút'
            : roomTitle
      }}
    </div>
    <button
      class="room-motion"
      :aria-label="app.state.settings.animation ? 'Tắt chuyển động' : 'Bật chuyển động'"
      :aria-pressed="app.state.settings.animation"
      @click="app.saveSettings({ animation: !app.state.settings.animation })"
    >
      <PixelIcon :name="app.state.settings.animation ? 'pause' : 'play'" :size="12" />
    </button>
  </div>
</template>
