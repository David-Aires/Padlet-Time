<script>
    import Login from "./routes/Login.svelte";
    import Register from "./routes/Register.svelte";
    import Board from "./routes/Board.svelte";
    import { Router, Link, Route} from "svelte-routing";

    export let url = "";
</script>



<Router url="{url}">
    <div>
        <Route path="/"><Login /></Route>
        <Route path="register"><Register /></Route>
        <Route path="board"><Board /></Route>
    </div>
  </Router>
