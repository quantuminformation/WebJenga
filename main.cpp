#include <iomanip>
#include <iostream>

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
    double stress_pa;
};

StressReport calculate_self_weight_stress(const ConcretePrism& prism) {
    constexpr double gravity_m_s2 = 9.80665;
    const double area_m2 = prism.width_m * prism.depth_m;
    const double volume_m3 = area_m2 * prism.height_m;
    const double mass_kg = prism.density_kg_m3 * volume_m3;
    const double self_weight_n = mass_kg * gravity_m_s2;
    const double stress_pa = self_weight_n / area_m2;

    return {area_m2, volume_m3, mass_kg, self_weight_n, stress_pa};
}

void print_report(const ConcretePrism& prism, const StressReport& report) {
    const double stress_kpa = report.stress_pa / 1000.0;
    const double stress_mpa = report.stress_pa / 1'000'000.0;

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

    std::cout << "Step 5: stress\n";
    std::cout << "  sigma = W / A\n";
    std::cout << "  sigma = " << report.self_weight_n << " / " << report.area_m2 << " = "
              << report.stress_pa << " Pa\n";
    std::cout << "  sigma = " << stress_kpa << " kPa\n";
    std::cout << "  sigma = " << stress_mpa << " MPa\n\n";

    std::cout << "Simplified identity for a prismatic member under self-weight:\n";
    std::cout << "  sigma = density x g x height\n";
    std::cout << "  sigma = " << prism.density_kg_m3 << " x 9.80665 x " << prism.height_m
              << " = " << report.stress_pa << " Pa\n";
}

int main() {
    const ConcretePrism prism{
        0.10,
        0.10,
        1.00,
        2400.0,
    };

    const StressReport report = calculate_self_weight_stress(prism);
    print_report(prism, report);
    return 0;
}
