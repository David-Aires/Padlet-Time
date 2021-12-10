<script>
    import Fa from 'svelte-fa';
    import { faClone} from '@fortawesome/free-solid-svg-icons';
</script>


<main>
    <div id="app-container">
        <header>
            <h1>
                <Fa icon={faClone} size="sm" />
        Padlet Time
            </h1>
        </header>
        <div class=container>
            <div class="wrapper">
                <button>Rejoindre une salle</button>
                <button>Crée une salle</button>
                </div>
        </div>
    </div>
</main>


<style>
    :global(body), :global(html), :global(#root) {
        height: 100%;
        width: 100%;
        display: block;
        margin: 0;
        padding: 0;
        color: white;
        background-color: #080808;
        font-family: "Montserrat", sans-serif;
  }

    #app-container {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
  }

  .container {
    flex: 1;
    overflow: hidden;
    display: block;
    transition: background-color 0.5s;
  }

  div.wrapper {
    width: 80%;
    height: 800px;
    margin: auto;
    margin-top: 30px;
  }

 left, right {
    width: 100%;
    height: 100%;
    display: block;
    align-content: center;
    background-color: rgba(0, 0, 0, 0.98);
}

   /* HEADER */

    header {
        height: 4em;
        display: block;
        position: relative;
        background-color:#484848;
        box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.16),
        0 2px 10px 0 rgba(0, 0, 0, 0.12);
        text-align: center;
        flex: 0 0 4em;
        transition: color .5s, background-color .5s;
  }
</style>