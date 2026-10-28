// Windows sürümünde ek konsol penceresi açılmasını engeller.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nexlearn_lib::run()
}
