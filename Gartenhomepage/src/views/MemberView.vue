<template>
  <div>
    <h1>Mitglieder</h1>
    <div v-if="userData">
      <p>Benutzername: {{ userData.username }}</p>
      <p>ID: {{ userData.ID }}</p>
      <p>Rolle: {{ userData.role }}</p>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  setup() {
    const userData = ref(null);

    onMounted(() => {
      const eventSource = new EventSource('http://localhost:3000/events');

      eventSource.onmessage = (event) => {
        userData.value = JSON.parse(event.data);
      };
    });

    return {
      userData
    };
  }
};
</script>

<style scoped>
/* CSS-Stile */
</style>
