<script>
    import { getContext } from 'svelte';
    import room from "../stores/Room.js";
    export let message;
      export let hasForm = false;
  
    const { close } = getContext('simple-modal');
      
      let value;
      let onChange = () => {};
      
      function _onCancel() {
          onCancel();
          close();
      }
      
      function _onOkay() {
          room.add(value)
          close();
      }
      
      $: onChange(value)
  </script>
  
  <style>
    h2 {
          font-size: 2rem;
          text-align: center;
      }
      
      input {
          width: 100%;
      }
      
      .buttons {
          display: flex;
          justify-content: space-between;
      }
  </style>
  
  <h2>{message}</h2>
  
  {#if hasForm}
      <input
      type="text"
        bind:value
        on:keydown={e => e.which === 13 && _onOkay()} />
  {/if}
  
  <div class="buttons">
      <button on:click={_onCancel}>
          Cancel
      </button>
      <button on:click={_onOkay}>
          Okay
      </button>
  </div>