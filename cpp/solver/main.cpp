#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

struct ElasticMaterial {
    double density_kg_m3;
    double youngs_modulus_pa;
    double poisson_ratio;
};

struct ConcretePrism {
    double width_m;
    double depth_m;
    double height_m;
    ElasticMaterial material;
};

struct GroundDomain {
    double depth_m;
    ElasticMaterial material;
};

struct CoupledBoundaryState {
    double contact_shape_factor;
    double coupling_ratio;
    double equivalent_ground_modulus_pa;
    double equivalent_specimen_modulus_pa;
    double max_contact_pressure_pa;
    double min_contact_pressure_pa;
};

struct StressReport {
    double area_m2;
    CoupledBoundaryState boundary;
    double volume_m3;
    double mass_kg;
    double self_weight_n;
    double applied_load_n;
    double self_weight_stress_pa;
    double applied_load_stress_pa;
    double combined_stress_pa;
};

constexpr double gravity_m_s2 = 9.80665;
constexpr double pi = 3.14159265358979323846;

ConcretePrism build_prism(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio) {
    return {
        width_m,
        depth_m,
        height_m,
        {
            density_kg_m3,
            specimen_youngs_modulus_mpa * 1'000'000.0,
            specimen_poisson_ratio,
        },
    };
}

GroundDomain build_ground(
    double density_kg_m3,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double ground_depth_m) {
    return {
        ground_depth_m,
        {
            density_kg_m3,
            ground_youngs_modulus_mpa * 1'000'000.0,
            ground_poisson_ratio,
        },
    };
}

double calculate_equivalent_modulus_pa(const ElasticMaterial& material) {
    const double denominator = std::max(1e-6, 1.0 - material.poisson_ratio * material.poisson_ratio);
    return material.youngs_modulus_pa / denominator;
}

CoupledBoundaryState calculate_coupled_boundary_state(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double average_contact_pressure_pa) {
    const double equivalent_specimen_modulus_pa = calculate_equivalent_modulus_pa(prism.material);
    const double equivalent_ground_modulus_pa = calculate_equivalent_modulus_pa(ground.material);
    const double characteristic_length_m = std::sqrt(std::max(prism.width_m * prism.depth_m, 1e-6));
    const double coupling_ratio = std::clamp(
        (equivalent_specimen_modulus_pa * characteristic_length_m) /
            std::max(equivalent_ground_modulus_pa * std::max(prism.height_m, 1e-6), 1e-6),
        0.05,
        25.0
    );

    return {
        0.0,
        coupling_ratio,
        equivalent_ground_modulus_pa,
        equivalent_specimen_modulus_pa,
        average_contact_pressure_pa,
        average_contact_pressure_pa,
    };
}

StressReport calculate_stress_report(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double applied_load_n) {
    const double area_m2 = prism.width_m * prism.depth_m;
    const double volume_m3 = area_m2 * prism.height_m;
    const double mass_kg = prism.material.density_kg_m3 * volume_m3;
    const double self_weight_n = mass_kg * gravity_m_s2;
    const double self_weight_stress_pa = self_weight_n / area_m2;
    const double applied_load_stress_pa = applied_load_n / area_m2;
    const double combined_stress_pa = self_weight_stress_pa + applied_load_stress_pa;
    const CoupledBoundaryState boundary =
        calculate_coupled_boundary_state(prism, ground, combined_stress_pa);

    return {
        area_m2,
        boundary,
        volume_m3,
        mass_kg,
        self_weight_n,
        applied_load_n,
        self_weight_stress_pa,
        applied_load_stress_pa,
        combined_stress_pa,
    };
}

bool is_inside_prism(const ConcretePrism& prism, double x_m, double y_m, double z_m) {
    return std::abs(x_m) <= prism.width_m * 0.5 &&
           std::abs(z_m) <= prism.depth_m * 0.5 &&
           y_m >= -prism.height_m * 0.5 &&
           y_m <= prism.height_m * 0.5;
}

double calculate_boussinesq_footing_stress_increment_pa(
    const ConcretePrism& prism,
    const StressReport& report,
    double depth_below_surface_m,
    double x_m,
    double z_m) {
    if (depth_below_surface_m <= 0.0) {
        return 0.0;
    }

    const bool is_inside_footprint =
        std::abs(x_m) <= prism.width_m * 0.5 &&
        std::abs(z_m) <= prism.depth_m * 0.5;
    const double shallow_cutoff_m = std::max(1e-4, std::min(prism.width_m, prism.depth_m) * 0.02);

    if (depth_below_surface_m <= shallow_cutoff_m) {
        return is_inside_footprint ? report.combined_stress_pa : 0.0;
    }

    const int steps_x = std::clamp(
        static_cast<int>(std::ceil(prism.width_m / std::max(prism.width_m / 26.0, depth_below_surface_m * 0.18))),
        14,
        30
    );
    const int steps_z = std::clamp(
        static_cast<int>(std::ceil(prism.depth_m / std::max(prism.depth_m / 26.0, depth_below_surface_m * 0.18))),
        14,
        30
    );
    const double sample_width_m = prism.width_m / static_cast<double>(steps_x);
    const double sample_depth_m = prism.depth_m / static_cast<double>(steps_z);
    const double uniform_pressure_pa = report.combined_stress_pa;
    double stress_increment_pa = 0.0;

    for (int x_index = 0; x_index < steps_x; ++x_index) {
        const double sample_x_m =
            -prism.width_m * 0.5 + (static_cast<double>(x_index) + 0.5) * sample_width_m;

        for (int z_index = 0; z_index < steps_z; ++z_index) {
            const double sample_z_m =
                -prism.depth_m * 0.5 + (static_cast<double>(z_index) + 0.5) * sample_depth_m;
            const double dx_m = x_m - sample_x_m;
            const double dz_m = z_m - sample_z_m;
            const double radius_squared_m2 =
                dx_m * dx_m + dz_m * dz_m + depth_below_surface_m * depth_below_surface_m;
            const double sample_load_n = uniform_pressure_pa * sample_width_m * sample_depth_m;
            const double kernel =
                (3.0 * std::pow(depth_below_surface_m, 3.0)) /
                (2.0 * pi * std::pow(radius_squared_m2, 2.5));

            stress_increment_pa += sample_load_n * kernel;
        }
    }

    return stress_increment_pa;
}

double calculate_stress_at_point_pa(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    const StressReport& report,
    double x_m,
    double y_m,
    double z_m) {
    const double ground_top_y_m = -prism.height_m * 0.5;

    if (is_inside_prism(prism, x_m, y_m, z_m)) {
        const double cover_to_top_m = prism.height_m * 0.5 - y_m;
        return report.applied_load_stress_pa +
               prism.material.density_kg_m3 * gravity_m_s2 * cover_to_top_m;
    }

    if (y_m < ground_top_y_m && y_m >= ground_top_y_m - ground.depth_m) {
        const double depth_below_surface_m = ground_top_y_m - y_m;
        const double geostatic_stress_pa =
            ground.material.density_kg_m3 * gravity_m_s2 * depth_below_surface_m;
        const double footing_increment_pa = calculate_boussinesq_footing_stress_increment_pa(
            prism,
            report,
            depth_below_surface_m,
            x_m,
            z_m
        );

        return geostatic_stress_pa + footing_increment_pa;
    }

    return 0.0;
}

double calculate_stress_at_point_pa(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double applied_load_n,
    double x_m,
    double y_m,
    double z_m) {
    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    return calculate_stress_at_point_pa(prism, ground, report, x_m, y_m, z_m);
}

void sample_ground_grid_pa(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double applied_load_n,
    double sample_y_m,
    double field_width_m,
    double field_depth_m,
    int columns,
    int rows,
    double* output_values_pa) {
    if (!output_values_pa || columns <= 0 || rows <= 0) {
        return;
    }

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);

    for (int row_index = 0; row_index < rows; ++row_index) {
        const double z_ratio = rows > 1 ? static_cast<double>(row_index) / static_cast<double>(rows - 1) : 0.0;
        const double z_m = field_depth_m * 0.5 - z_ratio * field_depth_m;

        for (int column_index = 0; column_index < columns; ++column_index) {
            const double x_ratio =
                columns > 1 ? static_cast<double>(column_index) / static_cast<double>(columns - 1) : 0.0;
            const double x_m = -field_width_m * 0.5 + x_ratio * field_width_m;
            const int value_index = row_index * columns + column_index;

            output_values_pa[value_index] =
                calculate_stress_at_point_pa(prism, ground, report, x_m, sample_y_m, z_m);
        }
    }
}

void sample_plane_section_pa(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double applied_load_n,
    double origin_x_m,
    double origin_y_m,
    double origin_z_m,
    double u_axis_x,
    double u_axis_y,
    double u_axis_z,
    double v_axis_x,
    double v_axis_y,
    double v_axis_z,
    double u_min_m,
    double u_max_m,
    double v_min_m,
    double v_max_m,
    int columns,
    int rows,
    double* output_values_pa) {
    if (!output_values_pa || columns <= 0 || rows <= 0) {
        return;
    }

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);

    for (int row_index = 0; row_index < rows; ++row_index) {
        const double v_ratio = rows > 1 ? static_cast<double>(row_index) / static_cast<double>(rows - 1) : 0.0;
        const double v_m = v_max_m - v_ratio * (v_max_m - v_min_m);

        for (int column_index = 0; column_index < columns; ++column_index) {
            const double u_ratio =
                columns > 1 ? static_cast<double>(column_index) / static_cast<double>(columns - 1) : 0.0;
            const double u_m = u_min_m + u_ratio * (u_max_m - u_min_m);
            const double x_m = origin_x_m + u_axis_x * u_m + v_axis_x * v_m;
            const double y_m = origin_y_m + u_axis_y * u_m + v_axis_y * v_m;
            const double z_m = origin_z_m + u_axis_z * u_m + v_axis_z * v_m;
            const int value_index = row_index * columns + column_index;

            output_values_pa[value_index] =
                calculate_stress_at_point_pa(prism, ground, report, x_m, y_m, z_m);
        }
    }
}

void print_report(const ConcretePrism& prism, const GroundDomain& ground, const StressReport& report) {
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
    std::cout << "  density = " << prism.material.density_kg_m3 << " kg/m^3\n";
    std::cout << "  specimen E = " << prism.material.youngs_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  specimen nu = " << prism.material.poisson_ratio << "\n";
    std::cout << "  ground E = " << ground.material.youngs_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  ground nu = " << ground.material.poisson_ratio << "\n\n";

    std::cout << "Step 1: area\n";
    std::cout << "  A = width x depth\n";
    std::cout << "  A = " << prism.width_m << " x " << prism.depth_m << " = " << report.area_m2 << " m^2\n\n";

    std::cout << "Step 2: volume\n";
    std::cout << "  V = A x height\n";
    std::cout << "  V = " << report.area_m2 << " x " << prism.height_m << " = " << report.volume_m3 << " m^3\n\n";

    std::cout << "Step 3: mass\n";
    std::cout << "  m = density x V\n";
    std::cout << "  m = " << prism.material.density_kg_m3 << " x " << report.volume_m3 << " = " << report.mass_kg << " kg\n\n";

    std::cout << "Step 4: self-weight\n";
    std::cout << "  W = m x g\n";
    std::cout << "  W = " << report.mass_kg << " x 9.80665 = " << report.self_weight_n << " N\n\n";

    std::cout << "Step 5: self-weight stress field\n";
    std::cout << "  sigma_self(y) increases linearly toward the base\n";
    std::cout << "  sigma_self,top = 0 Pa\n";
    std::cout << "  sigma_self,base = W / A\n";
    std::cout << "  sigma_self,base = " << report.self_weight_n << " / " << report.area_m2 << " = "
              << report.self_weight_stress_pa << " Pa\n";
    std::cout << "  sigma_self,base = " << self_weight_stress_kpa << " kPa\n\n";

    std::cout << "Step 6: applied top load stress\n";
    std::cout << "  sigma_P = P / A\n";
    std::cout << "  sigma_P = " << report.applied_load_n << " / " << report.area_m2 << " = "
              << report.applied_load_stress_pa << " Pa\n";
    std::cout << "  sigma_P = " << applied_load_stress_kpa << " kPa\n";
    std::cout << "  sigma_P is uniform through the prism\n\n";

    std::cout << "Step 7: total axial stress field\n";
    std::cout << "  sigma(y) = sigma_P + sigma_self(y)\n";
    std::cout << "  sigma_top_surface = sigma_P = " << report.applied_load_stress_pa << " Pa\n";
    std::cout << "  sigma_base = sigma_P + sigma_self,base\n";
    std::cout << "  sigma_base = " << report.applied_load_stress_pa << " + "
              << report.self_weight_stress_pa << " = " << report.combined_stress_pa << " Pa\n";
    std::cout << "  sigma_base = " << combined_stress_kpa << " kPa\n";
    std::cout << "  sigma_base = " << combined_stress_mpa << " MPa\n";
    std::cout << "  Each horizontal slice of the prism is uniform in this model.\n";
    std::cout << "  The only variation inside the prism is vertical, from self-weight.\n\n";

    std::cout << "Base-stress identity for this two-load demo:\n";
    std::cout << "  sigma_base = density x g x height + P / A\n";
    std::cout << "  sigma_base = " << prism.material.density_kg_m3 << " x 9.80665 x " << prism.height_m
              << " + " << report.applied_load_n << " / " << report.area_m2 << " = "
              << report.combined_stress_pa << " Pa\n";
    std::cout << "\nBoundary note:\n";
    std::cout << "  Equivalent specimen modulus = " << report.boundary.equivalent_specimen_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  Equivalent ground modulus = " << report.boundary.equivalent_ground_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  Coupling ratio = " << report.boundary.coupling_ratio << "\n";
    std::cout << "  Contact shape factor = " << report.boundary.contact_shape_factor << "\n";
    std::cout << "  Base contact range = "
              << report.boundary.min_contact_pressure_pa / 1000.0
              << " to "
              << report.boundary.max_contact_pressure_pa / 1000.0
              << " kPa\n";
    std::cout << "\nSpatial field note:\n";
    std::cout << "  Inside the prism the stress field is nominal axial stress only.\n";
    std::cout << "  In the ground it uses a Boussinesq elastic half-space integration for a uniformly loaded rectangular footing,\n";
    std::cout << "  plus geostatic stress from the same density.\n";
}

extern "C" {

EMSCRIPTEN_KEEPALIVE double calculate_combined_stress_pa(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n) {
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
        std::max(height_m * 1.5, std::max(width_m, depth_m) * 4.0)
    );

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    return report.combined_stress_pa;
}

EMSCRIPTEN_KEEPALIVE double calculate_max_contact_stress_pa(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n) {
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
        std::max(height_m * 1.5, std::max(width_m, depth_m) * 4.0)
    );

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    return report.boundary.max_contact_pressure_pa;
}

EMSCRIPTEN_KEEPALIVE void print_stress_report(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n) {
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
        std::max(height_m * 1.5, std::max(width_m, depth_m) * 4.0)
    );

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    print_report(prism, ground, report);
}

EMSCRIPTEN_KEEPALIVE double calculate_self_weight_stress_pa(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3) {
    return calculate_combined_stress_pa(
        width_m,
        depth_m,
        height_m,
        density_kg_m3,
        30'000.0,
        0.2,
        120.0,
        0.3,
        0.0
    );
}

EMSCRIPTEN_KEEPALIVE double calculate_stress_at_point_pa_export(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n,
    double ground_depth_m,
    double x_m,
    double y_m,
    double z_m) {
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
        ground_depth_m
    );

    return calculate_stress_at_point_pa(prism, ground, applied_load_n, x_m, y_m, z_m);
}

EMSCRIPTEN_KEEPALIVE void sample_ground_grid_pa_export(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n,
    double ground_depth_m,
    double sample_y_m,
    double field_width_m,
    double field_depth_m,
    int columns,
    int rows,
    double* output_values_pa) {
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
        ground_depth_m
    );

    sample_ground_grid_pa(
        prism,
        ground,
        applied_load_n,
        sample_y_m,
        field_width_m,
        field_depth_m,
        columns,
        rows,
        output_values_pa
    );
}

EMSCRIPTEN_KEEPALIVE void sample_plane_section_pa_export(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n,
    double ground_depth_m,
    double origin_x_m,
    double origin_y_m,
    double origin_z_m,
    double u_axis_x,
    double u_axis_y,
    double u_axis_z,
    double v_axis_x,
    double v_axis_y,
    double v_axis_z,
    double u_min_m,
    double u_max_m,
    double v_min_m,
    double v_max_m,
    int columns,
    int rows,
    double* output_values_pa) {
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
        ground_depth_m
    );

    sample_plane_section_pa(
        prism,
        ground,
        applied_load_n,
        origin_x_m,
        origin_y_m,
        origin_z_m,
        u_axis_x,
        u_axis_y,
        u_axis_z,
        v_axis_x,
        v_axis_y,
        v_axis_z,
        u_min_m,
        u_max_m,
        v_min_m,
        v_max_m,
        columns,
        rows,
        output_values_pa
    );
}

EMSCRIPTEN_KEEPALIVE void print_self_weight_report(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3) {
    print_stress_report(width_m, depth_m, height_m, density_kg_m3, 30'000.0, 0.2, 120.0, 0.3, 0.0);
}

}  // extern "C"

int main() {
#ifndef __EMSCRIPTEN__
    const ConcretePrism prism{
        0.10,
        0.10,
        1.00,
        {
            2400.0,
            30'000'000'000.0,
            0.2,
        },
    };
    const GroundDomain ground{
        1.5,
        {
            2400.0,
            120'000'000.0,
            0.3,
        },
    };

    const StressReport report = calculate_stress_report(prism, ground, 2500.0);
    print_report(prism, ground, report);
#endif
    return 0;
}
