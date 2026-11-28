<script setup>
defineProps({
  step: { type: [Number, String], default: '' },
  title: { type: String, default: '' },
  hint: { type: String, default: '' },
})
</script>

<template>
  <div class="card">
    <div class="card-h">
      <h3>
        <span v-if="step !== ''" class="step">{{ step }}</span>
        {{ title }}
      </h3>
      <div v-if="hint" class="hint">{{ hint }}</div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:18px 20px}
.card+.card{margin-top:16px}
.card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:14px}
.card-h h3{margin:0;font-size:14.5px;font-weight:600;letter-spacing:.3px;display:flex;align-items:center;gap:9px}
.step{width:20px;height:20px;border-radius:6px;background:var(--primary-soft);color:#8fb8ff;
  font-size:11px;display:grid;place-items:center;font-weight:600}
.hint{font-size:11.5px;color:var(--muted2);text-align:right}
</style>
