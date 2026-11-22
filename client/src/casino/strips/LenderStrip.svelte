<script lang="ts">
  // GOBLIN LENDERS, at the machine. Since Sep 2026 (Josh: "expand the
  // UI to take up the page … and on the atm pop out") the ATM's pop-out IS
  // the bank hall — the same component the hub kiosk mounts, sized to the
  // station dock by its `floor` prop — so the floor and the hub show one
  // machine with one face, and every counter (the windows, the cells, the
  // shelf) is reachable from the wall. The reuse-uniformity rule.
  import Lender from "../../components/Lender.svelte";
</script>

<div class="lstrip">
  <Lender floor />
</div>

<style>
  .lstrip {
    width: min(1080px, 96vw);
    margin: 0 auto;
    pointer-events: auto;
  }
</style>
