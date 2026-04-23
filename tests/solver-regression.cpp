#include <cmath>
#include <iostream>
#include <string>

#define main webjenga_solver_demo_main
#include "../cpp/solver/main.cpp"
#undef main

namespace {

void expect_near(const std::string& label, double actual, double expected, double tolerance) {
    if (std::abs(actual - expected) <= tolerance) {
        return;
    }

    std::cerr << label << " expected " << expected << " but got " << actual
              << " with tolerance " << tolerance << "\n";
    std::exit(1);
}

void expect_greater(const std::string& label, double actual, double lower_bound) {
    if (actual > lower_bound) {
        return;
    }

    std::cerr << label << " expected greater than " << lower_bound << " but got " << actual << "\n";
    std::exit(1);
}

}  // namespace

int main() {
    const double width_m = 1.0;
    const double depth_m = 1.0;
    const double height_m = 10.0;
    const double density_kg_m3 = 2400.0;
    const double specimen_youngs_modulus_mpa = 30000.0;
    const double specimen_poisson_ratio = 0.2;
    const double ground_youngs_modulus_mpa = 120.0;
    const double ground_poisson_ratio = 0.3;
    const double applied_load_n = 2500.0;
    const double area_m2 = width_m * depth_m;
    const double applied_stress_pa = applied_load_n / area_m2;
    const double self_weight_base_stress_pa = density_kg_m3 * gravity_m_s2 * height_m;
    const double combined_stress_pa = applied_stress_pa + self_weight_base_stress_pa;

    const ConcretePrism prism = build_prism(
        width_m,
        depth_m,
        height_m,
        density_kg_m3,
        specimen_youngs_modulus_mpa,
        specimen_poisson_ratio
    );
    const GroundDomain ground = build_ground(
        density_kg_m3,
        ground_youngs_modulus_mpa,
        ground_poisson_ratio,
        15.0
    );

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    expect_near("area", report.area_m2, area_m2, 1e-12);
    expect_near("volume", report.volume_m3, 10.0, 1e-12);
    expect_near("self-weight stress", report.self_weight_stress_pa, self_weight_base_stress_pa, 1e-9);
    expect_near("applied stress", report.applied_load_stress_pa, applied_stress_pa, 1e-12);
    expect_near("combined stress", report.combined_stress_pa, combined_stress_pa, 1e-9);

    expect_near(
        "exported combined stress",
        calculate_combined_stress_pa(
            width_m,
            depth_m,
            height_m,
            density_kg_m3,
            specimen_youngs_modulus_mpa,
            specimen_poisson_ratio,
            ground_youngs_modulus_mpa,
            ground_poisson_ratio,
            applied_load_n
        ),
        combined_stress_pa,
        1e-9
    );

    expect_near(
        "top pillar stress",
        calculate_stress_at_point_pa(prism, ground, report, 0.0, height_m * 0.5, 0.0),
        applied_stress_pa,
        1e-9
    );
    expect_near(
        "mid-height pillar stress",
        calculate_stress_at_point_pa(prism, ground, report, 0.0, 0.0, 0.0),
        applied_stress_pa + density_kg_m3 * gravity_m_s2 * (height_m * 0.5),
        1e-9
    );
    expect_near(
        "base pillar stress",
        calculate_stress_at_point_pa(prism, ground, report, 0.0, -height_m * 0.5, 0.0),
        combined_stress_pa,
        1e-9
    );

    const double ground_surface_y_m = -height_m * 0.5;
    const double shallow_depth_m = 0.00005;
    const double shallow_geostatic_pa = density_kg_m3 * gravity_m_s2 * shallow_depth_m;
    expect_near(
        "shallow ground stress inside footprint",
        calculate_stress_at_point_pa(prism, ground, report, 0.0, ground_surface_y_m - shallow_depth_m, 0.0),
        combined_stress_pa + shallow_geostatic_pa,
        1e-6
    );
    expect_near(
        "shallow ground stress outside footprint",
        calculate_stress_at_point_pa(prism, ground, report, 1.0, ground_surface_y_m - shallow_depth_m, 0.0),
        shallow_geostatic_pa,
        1e-9
    );

    const double centered_deep_stress_pa =
        calculate_stress_at_point_pa(prism, ground, report, 0.0, ground_surface_y_m - 1.0, 0.0);
    const double offset_deep_stress_pa =
        calculate_stress_at_point_pa(prism, ground, report, 2.5, ground_surface_y_m - 1.0, 0.0);
    expect_greater("centered deep ground stress", centered_deep_stress_pa, offset_deep_stress_pa);

    double grid_values[9] = {};
    sample_ground_grid_pa(prism, ground, applied_load_n, ground_surface_y_m - 1.0, 3.0, 3.0, 3, 3, grid_values);
    expect_greater("center grid stress", grid_values[4], grid_values[0]);
    expect_near("symmetric grid corners", grid_values[0], grid_values[8], 1e-6);

    std::cout << "solver regression tests passed\n";
    return 0;
}
