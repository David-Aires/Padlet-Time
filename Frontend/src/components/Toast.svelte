<script>
    import toast from "../stores/toast.js";
    import { fly } from "svelte/transition";
    let timeout;
    $: {
      $toast, clearTimeout(timeout);
      timeout = setTimeout(() => toast.set(undefined), 4000);
    }
  </script>
  
  <style>
    .toast {
      position: absolute;
      z-index: 10;
      text-align: center;
      top: 30px;
      left: 65%;
      right: 0;
    }
    .toast .message {
      color: white;
      display: inline-block;
      cursor: pointer;
      padding: 0.3rem;
      padding-left: 0.9rem;
      padding-right: 0.9rem;
      border-radius: 1rem;
      box-shadow: 0 6px 13px 0 rgba(0, 0, 0, 0.35);
      width: max-content;
      background: linear-gradient(
        125deg,
        var(--highlight1) 10%,
        var(--highlight2) 30% 70%,
        var(--highlight1) 90%
      );
    }
  </style>
  
  {#if $toast}
    <div
      class="toast"
      in:fly={{ y: -50, duration: 800 }}
      out:fly={{ y: -50, duration: 800 }}>
      <div class="message">{$toast}</div>
    </div>
  {/if}