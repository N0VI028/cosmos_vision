<script setup lang="ts">
import InlineGalleryMount from '@/panel/components/InlineGalleryMount.vue';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import { storeToRefs } from 'pinia';

const galleryStore = useGalleryRuntimesStore();
const { runtimes } = storeToRefs(galleryStore);
</script>

<template>
  <!-- 对标 TH Render.vue：按楼层 runtime Teleport 到 cv-render -->
  <template
    v-for="runtime in runtimes"
    :key="`${runtime.message_id}-${runtime.reload_memo}`"
  >
    <Teleport
      v-for="mount in runtime.mounts"
      :key="mount.key"
      defer
      :to="mount.element"
    >
      <InlineGalleryMount
        v-if="mount.element.isConnected"
        :mount="mount"
      />
    </Teleport>
  </template>
</template>
