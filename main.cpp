#include <iomanip>
#include <iostream>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

struct ConcretePrism {
    double width_m;
    double depth_m;
    double height_m;
    double density_kg_m3;
};

struct StressReport {
    double area_m2;
    double volume_m3;
    double mass_kg;
    double self_weight_n;
    double applied_load_n;
    double self_weight_stress_pa;
    double applied_load_stress_pa;
    double combined_stress_pa;
};

StressReport calculate_stress_report(const ConcretePrism& prism, double applied_load_n) {
    constexpr double gravity_m_s2 = 9.80665;
    const double area_m2 = prism.width_m * prism.depth_m;
    const double volume_m3 = area_m2 * prism.height_m;
    const double mass_kg = prism.density_kg_m3 * volume_m3;
    const double self_weight_n = mass_kg * gravity_m_s2;
    const double self_weight_stress_pa = self_weight_n / area_m2;
    const double applied_load_stress_pa = applied_load_n / area_m2;
    const double combined_stress_pa = self_weight_stress_pa + applied_load_stress_pa;

    return {
        area_m2,
        volume_m3,
        mass_kg,
        self_weight_n,
        applied_load_n,
        self_weight_stress_pa,
        applied_load_stress_pa,
        combined_stress_pa,
    };
}

void print_report(const ConcretePrism& prism, const StressReport& report) {
    const double self_weight_stress_kpa = report.self_weight_stress_pa / 1000.0;
    const double applied_load_stress_kpa = report.applied_load_stress_pa / 1000.0;
    const double combined_stress_kpa = report.combined_stress_pa / 1000.0;
    const double combined_stress_mpa = report.combined_stress_pa / 1'000'000.0;

    std::cout << std::fixed << std::setprecision(4);
    std::cout << "Concrete prism stress demo\n";
    std::cout << "================================\n\n";
    std::cout << "Geometry:\n";
    std::cout << "  width  = " << prism.width_m << " m\n";
    std::cout << "  depth  = " << prism.depth_m << " m\n";
    std::cout << "  height = " << prism.height_m << " m\n";
    std::cout << "  density = " << prism.density_kg_m3 << " kg/m^3\n\n";

    std::cout << "Step 1: area\n";
    std::cout << "  A = width x depth\n";
    std::cout << "  A = " << prism.width_m << " x " << prism.depth_m << " = " << report.area_m2 << " m^2\n\n";

    std::cout << "Step 2: volume\n";
    std::cout << "  V = A x height\n";
    std::cout << "  V = " << report.area_m2 << " x " << prism.height_m << " = " << report.volume_m3 << " m^3\n\n";

    std::cout << "Step 3: mass\n";
    std::cout << "  m = density x V\n";
    std::cout << "  m = " << prism.density_kg_m3 << " x " << report.volume_m3 << " = " << report.mass_kg << " kg\n\n";

    std::cout << "Step 4: self-weight\n";
    std::cout << "  W = m x g\n";
    std::cout << "  W = " << report.mass_kg << " x 9.80665 = " << report.self_weight_n << " N\n\n";

    std::cout << "Step 5: self-weight stress\n";
    std::cout << "  sigma_self = W / A\n";
    std::cout << "  sigma_self = " << report.self_weight_n << " / " << report.area_m2 << " = "
              << report.self_weight_stress_pa << " Pa\n";
    std::cout << "  sigma_self = " << self_weight_stress_kpa << " kPa\n\n";

    std::cout << "Step 6: applied top load stress\n";
    std::cout << "  sigma_top = P / A\n";
    std::cout << "  sigma_top = " << report.applied_load_n << " / " << report.area_m2 << " = "
              << report.applied_load_stress_pa << " Pa\n";
    std::cout << "  sigma_top = " << applied_load_stress_kpa << " kPa\n\n";

    std::cout << "Step 7: combined stress\n";
    std::cout << "  sigma_total = sigma_self + sigma_top\n";
    std::cout << "  sigma_total = " << report.self_weight_stress_pa << " + "
              << report.applied_load_stress_pa << " = " << report.combined_stress_pa << " Pa\n";
    std::cout << "  sigma_total = " << combined_stress_kpa << " kPa\n";
    std::cout << "  sigma_total = " << combined_stress_mpa << " MPa\n\n";

    std::cout << "Identity for this two-load demo:\n";
    std::cout << "  sigma_total = density x g x height + P / A\n";
    std::cout << "  sigma_total = " << prism.density_kg_m3 << " x 9.80665 x " << prism.height_m
              << " + " << report.applied_load_n << " / " << report.area_m2 << " = "
              << report.combined_stress_pa << " Pa\n";
}

extern "C" {

EMSCRIPTEN_KEEPALIVE double calculate_combined_stress_pa(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double applied_load_n) {
    const ConcretePrism prism{
        width_m,
        depth_m,
        height_m,
        density_kg_m3,
    };

    return calculate_stress_report(prism, applied_load_n).combined_stress_pa;
}

EMSCRIPTEN_KEEPALIVE void print_stress_report(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double applied_load_n) {
    const ConcretePrism prism{
        width_m,
        depth_m,
        height_m,
        density_kg_m3,
    };

    const StressReport report = calculate_stress_report(prism, applied_load_n);
    print_report(prism, report);
}

EMSCRIPTEN_KEEPALIVE double calculate_self_weight_stress_pa(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3) {
    return calculate_combined_stress_pa(width_m, depth_m, height_m, density_kg_m3, 0.0);
}

EMSCRIPTEN_KEEPALIVE void print_self_weight_report(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3) {
    print_stress_report(width_m, depth_m, height_m, density_kg_m3, 0.0);
}

} // extern "C"

int main() {
#ifndef __EMSCRIPTEN__
    const ConcretePrism prism{
        0.10,
        0.10,
        1.00,
        2400.0,
    };

    const StressReport report = calculate_stress_report(prism, 2500.0);
    print_report(prism, report);
#endif
    return 0;
}
